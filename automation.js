var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var loki = require('lokijs');
var schedule = require('node-schedule');
var moment = require('moment');
var csv = require('csvtojson');

var timers = require('./timers');
var openhab = require('./openhab');
var beckhoff = require('./beckhoff');
var influx = require('./influxdb');

const expressPort = 8100;

moment().format();
var app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());

var lokiDB = new loki("automation_data.json");
var jobQueue = lokiDB.addCollection('jobs');
var tmrQueue = lokiDB.addCollection('timers');

var jobBusy = false;

function importCsvData(csvFile, collectionName) {

  csv({
      delimiter:';'
    })
    .fromFile(csvFile)
    .then((jsonObj)=>{
        collectionName.insert(jsonObj);
    })

}

// import van gegevens
importCsvData(__dirname + "/data/openhab.csv", openhab.ohItems);
importCsvData(__dirname + "/data/timers.csv", timers.rules);


function processJobQueue() {
  setTimeout(processJobQueue, 125);

  if (jobBusy) {
    // previous job is still running: come back next time
    return;
  }

  jobQueue.findAndRemove({ 'isBusy' : { '$eq' : true }});

  let todoList = jobQueue.find({ 'isBusy' : { '$eq' : false }});

  if (todoList.length == 0) {
    return;
  }
  todoList[0].isBusy = true;
  jobQueue.update(todoList[0]);

  let curTime = moment().unix();

  if (todoList[0].target == 'OPENHAB' && todoList[0].action == 'GET') {
    // get values from OpenHAB

  } else if (todoList[0].target == 'OPENHAB' && todoList[0].action == 'SET') {
    // set values in OpenHAB
    if (Array.isArray(todoList[0].data)) {
      (todoList[0].data).forEach(element => {
        openhab.sendUpdate(element);
      })
    } else {
      openhab.sendUpdate(todoList[0].data)
    }
  } else if (todoList[0].target == 'BECKHOFF' && todoList[0].action == 'GET') {
    // get values from Beckhoff PLC
    // todoList.data contains handle definition to use for beckhoff call
    if (Array.isArray(todoList[0].data)) {
      beckhoff.getPlcSymbols(todoList[0].data, (err, data) => {
        if (err) {
          console.warn('GET PLC : ' + err);
          return;
        }
        data.forEach(element => {
          let influxData = openhab.localUpdate(element, curTime);

          if (influxData != '') {
            let scheduleJob = {
              'target'   : 'INFLUX',
              'action'   : 'SET',
              'database' : todoList[0].database,
              'data'     : influx.prepareUpdate(influxData),
              'isBusy'   : false
            }
            jobQueue.insertOne(scheduleJob);
          }
        });
      });
    } else {
      beckhoff.getPlcSymbol(todoList[0].data, (err, data) => {
        if (err) {
          console.warn('GET PLC : ' + err);
          return;
        }

        let influxData = openhab.localUpdate(data, curTime);

        if (influxData != '') {
          let scheduleJob = {
            'target'   : 'INFLUX',
            'action'   : 'SET',
            'database' : todoList[0].database,
            'data'     : influx.prepareUpdate(influxData),
            'isBusy'   : false
          }
          jobQueue.insertOne(scheduleJob);
        }
      });
    }
  } else if (todoList[0].target == 'BECKHOFF' && todoList[0].action == 'SET') {
    // set values in Beckhoff PLC
    // todoList.data contains handle definition to use for beckhoff call

    if (Array.isArray(todoList[0].data)) {
      beckhoff.setPlcSymbols(todoList[0].data, (err, data) => {
        if (err) {
          console.warn('SET PLC : ' + err);
          return;
        }

        data.forEach(element => {
          let influxData = openhab.localUpdate(element, curTime);

          if (influxData != '') {
            let scheduleJob = {
              'target'   : 'INFLUX',
              'action'   : 'SET',
              'database' : todoList[0].database,
              'data'     : influx.prepareUpdate(influxData),
              'isBusy'   : false
            }
            jobQueue.insertOne(scheduleJob);
          }
        });

      });
    } else {
      beckhoff.setPlcSymbol(todoList[0].data, (err, data) => {

        if (err) {
          console.warn('SET PLC : ' + err);
          return;
        }
        let influxData = openhab.localUpdate(data, curTime);

        if (influxData != '') {
          let scheduleJob = {
            'target'   : 'INFLUX',
            'action'   : 'SET',
            'database' : todoList[0].database,
            'data'     : influx.prepareUpdate(influxData),
            'isBusy'   : false
          }
          jobQueue.insertOne(scheduleJob);
        }
      });
    }
  } else if (todoList[0].target == 'INFLUX' && todoList[0].action == 'GET') {

  } else if (todoList[0].target == 'INFLUX' && todoList[0].action == 'SET') {
    //todoList[0].data.database = todoList[0].database;

    influx.sendUpdate(todoList[0].database, todoList[0].data);
  }
}

function initTimerQueue() {

  //let result = check_5secs.cancelNext(true);

  tmrQueue.clear();

  let newRules = timers.initiate();

  tmrQueue.insert(newRules);

  //check_5secs.reschedule();
  let nextInvoke = check_5secs.nextInvocation();

}

function processTimerQueue() {
  //setTimeout(processTimerQueue, 5000);

  let curTime = moment().unix();
  let nextTime = moment().add(5, 'seconds').unix();

  let actions = tmrQueue.find({ 'time' : { '$between' : [curTime, nextTime] }});

  // something has to happen in the next 5sec ?
  if (actions.length > 0) {
    let tmrRule = tmrRules.find({ 'rowid' : { '$eq' : action.ruleId }});

    //calc new time
    action.time = calculateNextTime(tmrRule[0]);
    // ... and update the queue with the new value
    tmrQueue.update(action);

    let symData = openhab.ohItems.find({ item : { '$eq' : todoList[0].item }});
    let handle = {
      'symname'    : symData.plc,
      //'symhandle'  : symData.handle,
      'propname'   : 'value',
      'value'      : todoList[0].value,
      'bytelength' : 0
    };
    // TODO : check if this rule belongs to an active schedule
    let timerJob = {
      'target' : 'BECKHOFF',
      'action' : 'SET',
      'data'   : handle,
      'isBusy' : false
    };

    jobQueue.insertOne(timerJob);
  }
}

// every 5 seconds
var check_5secs = schedule.scheduleJob('1-59/5 * * * * *', function() {
    //console.log("checking presence");
    
    let scheduleJob = {
      'target'   : 'BECKHOFF',
      'action'   : 'GET',
      'database' : 'openhab_db',
      'data'     : openhab.getCategory("LICHT"),
      'isBusy'   : false
    }
    jobQueue.insertOne(scheduleJob);

    scheduleJob = {
      'target'   : 'BECKHOFF',
      'action'   : 'GET',
      'database' : 'openhab_db',
      'data'     : openhab.getCategory("ACCESS"),
      'isBusy'   : false
    }
    jobQueue.insertOne(scheduleJob);

    scheduleJob = {
      'target'   : 'BECKHOFF',
      'action'   : 'GET',
      'database' : 'openhab_db',
      'data'     : openhab.getCategory("SCREENS"),
      'isBusy'   : false
    }
    jobQueue.insertOne(scheduleJob);

    processTimerQueue();
})

// every 15 seconds
var check_15secs = schedule.scheduleJob('3-59/15 * * * * *', function() {

  let ohUpdates = openhab.getUpdates("'LICHT','ACCESS','SCREENS'");
  if (ohUpdates != "") {
    scheduleJob = {
      'target' : 'OPENHAB',
      'action' : 'SET',
      'data'   : ohUpdates,
      'isBusy' : false
    }
    jobQueue.insertOne(scheduleJob);
  }

  ohUpdates = openhab.getUpdates("'TEMP','LIGHT','WIND'");
  if (ohUpdates != "") {
    scheduleJob = {
      'target' : 'OPENHAB',
      'action' : 'SET',
      'data'   : ohUpdates,
      'isBusy' : false
    }
    jobQueue.insertOne(scheduleJob);
  }
})

// every minute
var check_1min = schedule.scheduleJob('1-59/1 * * * *', function() {
  //console.log("checking beckhoff sensors");  
  
  let scheduleJob = {
    'target'   : 'BECKHOFF',
    'action'   : 'GET',
    'database' : 'beckhoff_db',
    'data'     : openhab.getCategory("TEMP"),
    'isBusy'   : false
  }
  jobQueue.insertOne(scheduleJob);
  scheduleJob = {
    'target'   : 'BECKHOFF',
    'action'   : 'GET',
    'database' : 'beckhoff_db',
    'data'     : openhab.getCategory("LIGHT"),
    'isBusy'   : false
  }
  jobQueue.insertOne(scheduleJob);
  scheduleJob = {
    'target'   : 'BECKHOFF',
    'action'   : 'GET',
    'database' : 'beckhoff_db',
    'data'     : openhab.getCategory("WIND"),
    'isBusy'   : false
  }
  jobQueue.insertOne(scheduleJob);

  
    
})

/*
 * EXPRESS calls
 */
function unhandledRequest(req, response, next){
  response.status(400)
    .json({ error: "unhandled request"})
    .end();
}
app.use(unhandledRequest);

app.get('/getValues', function(req, res) {
  let catName = req.query.var;
  
  let outbound = [];

  let checkVars = openhab.ohItems.find({ category : { '$eq' : catName }});

  checkVars.forEach(element => {
    let outItem = {
      'item' : element.item,
      'value': element.value
    }
    
    outbound.push(outItem);
  });

  console.log(JSON.stringify(outbound));

  res.status(200).json(outbound).end();
})

app.get('/updateValues', function(req, res) {

})

app.get('/setPlcValue', function(req,res) {
  let itemName = req.query.var;
  let itemValue = req.query.state;

  console.log('express : ' + itemName + ' --> ' + itemValue);

  let scheduleJob = {
    'target'   : 'BECKHOFF',
    'action'   : 'SET',
    'database' : 'openhab_db',
    'data'     : openhab.getItem(itemName, itemValue),
    'isBusy'   : false
  }
  jobQueue.insertOne(scheduleJob);

  res.status(200).json('update queued').end();
})

var server = app.listen(expressPort, function() {
	var srvHost = server.address().address
	var srvPort = server.address().port
	
	console.log("automation app listening at http://%s:%s", srvHost, srvPort);
})

// give everything time to settle in... 
setTimeout(() => {
  initTimerQueue();
  processJobQueue();
}, 500);

function shutdown() {
  console.warn('exiting...');
  check_5secs.cancel();
  check_1min.cancel();

  jobQueue.clear()
  tmrQueue.clear();
}

process.on('exit', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Caught exception:' + err);
  shutdown();
});
process.on('SIGKILL', shutdown);
process.on('SIGINT', shutdown);