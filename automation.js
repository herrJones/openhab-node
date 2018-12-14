var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var loki = require('lokijs');
var schedule = require('node-schedule');
var moment = require('moment');
var csv = require('csvtojson');

var timers = require('./timers');
//var beckhoff = require('./beckhoff');
//var influx = require('./influxdb');


moment().format();
var app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());

var lokiDB = new loki("automation_data.json");
var jobQueue = lokiDB.addCollection('jobs');
var tmrQueue = lokiDB.addCollection('timers');

//tmrQueue.i

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
//importCsvData(__dirname + "/data/openhab.csv", ohItems);
importCsvData(__dirname + "/data/timers.csv", timers.rules);


function processJobQueue() {
 // setTimeout(processJobQueue, 250);

  if (jobBusy) {
    // previous job is still running: come back next time
    return;
  }

  jobQueue.findAndRemove({ isBusy : { '$eq' : 1 }});

  let todoList = jobQueue.find({ isBusy : { '$eq' : 0 }});

  if (todoList.length == 0) {
    return;
  }
  todoList[0].isBusy = 1;
  jobQueue.update(todoList[0]);

  if (todoList[0].target == 'OH2' && todoList[0].action == 'GET') {
    // get values from OpenHAB
  } else if (todoList[0].target == 'OH2' && todoList[0].action == 'SET') {
    // set values in OpenHAB
  } else if (todoList[0].target == 'BECKHOFF' && todoList[0].action == 'GET') {
    // get values from Beckhoff PLC

    //determine symbol / handle to use for beckhoff-plc
  } else if (todoList[0].target == 'BECKHOFF' && todoList[0].action == 'SET') {
    // set values in Beckhoff PLC
  }
}

function initTimerQueue() {

  check_5secs.cancelNext();

  tmrQueue.clear();

  let newRules = timers.initiate();

  tmrQueue.insert(newRules);

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

    // TODO : check if this rule belongs to an active schedule

    let timerJob = {
      'target' : 'BECKHOFF',
      'action' : 'SET',
      'item'   : action.item,
      'value'  : action.value
    }

    jobQueue.insertOne(timerJob);
  }

}

// every 5 seconds
var check_5secs = schedule.scheduleJob('1-59/5 * * * * *', function() {
    //console.log("checking presence");
    jobQueue.insert({kind: "LICHT", database: "openhab_db", request: Date.now(), isBusy: 0 });
    jobQueue.insert({kind: "ACCESS", database: "openhab_db", request: Date.now(), isBusy: 0 });

    processTimerQueue();
})

// every minute
var check_1min = schedule.scheduleJob('1-59/1 * * * *', function() {
    //console.log("checking beckhoff sensors");  
  
    jobQueue.insert({kind: "TEMP", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
    jobQueue.insert({kind: "LIGHT", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
    jobQueue.insert({kind: "WIND", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
})

// give everything time to settle in... 
setTimeout(() => {
  initTimerQueue();
  processJobQueue();
}, 250);

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