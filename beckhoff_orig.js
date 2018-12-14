var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var schedule = require('node-schedule');
var loki = require('lokijs');
var csv = require('csvtojson');
var ads = require('./node-ads/lib/ads');
var ip = require('ip');
var moment = require('moment');

const beckhoffIP = "10.81.20.25";
const localIP = ip.address();

const influxIP = "10.81.20.55";
const influxPort = 8086;
const influxUser = "nodejs";
const influxPass = "Node.JS";

const openhabIP = "10.81.20.60";
const openhabPort = 8080;

const expressPort = 8100;

// aanmaak in-memory database
// aanmaak structuren / tabellen
var lokiDB = new loki("plc_data.json");
var ohItems  = lokiDB.addCollection('openhab', { indices : ['category'], unique: ['item'] });
var tmrRules = lokiDB.addCollection('rules', { indices : ['item'] });
var jobQueue = lokiDB.addCollection('jobs');
var tmrQueue = lokiDB.addCollection('actions', { indices : ['time'] });

moment().format();
var app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());


var jobBusy = false;

var plcOptions = {
  //The IP or hostname of the target machine
  host: beckhoffIP,
  //The NetId of the target machine
  amsNetIdTarget: "5.42.129.71.1.1",
  //The NetId of the source machine.
  amsNetIdSource: localIP + ".1.1",

  //OPTIONAL: (These are set by default)
  //The tcp destination port
  //port: 48898
  //The ams source port
  //amsPortSource: 32905
  //The ams target port
  amsPortTarget: 851
}

// import van gegevens
importCsvData(__dirname + "/data/openhab.csv", ohItems);
importCsvData(__dirname + "/data/timers.csv", tmrRules);

function importCsvData(csvFile, collectionName) {

  csv({
      delimiter:';'
    })
    .fromFile(csvFile)
    .then((jsonObj)=>{
        collectionName.insert(jsonObj);
    })

}

function sendInfluxUpdate(database, data) {

  let options = {
    host: influxIP, 
    port: influxPort,
    path: "/write?db=" + database + "&u=" + influxUser + "&p=" + influxPass,
    method: "POST",
    headers:  {
      'Content-Type': 'application/x-binary',
      'Content-Length': data.length
    }
  }

  let req = http.request(options, function(res) {
    let result = '';

    res.on('data', (chunk) => {
      result += chunk;
    }).on('error', (err) => {
      console.log(data.item + "(ERROR) :" + err.stack);
    }).on('end', () => {
      if (result != "") {
        console.log(data.item + " : " + result);
      }
    });
  });
  
  req.write(data);

  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.end();
}

function sendOpenhabUpdate(data) {
  let body = "";
  if (data.kind == "BOOL") {
    if (data.category == "ACCESS") {
      body = (data.value == 1 ? "CLOSED" : "OPEN" );
    } else {
      body = (data.value == 1 ? "ON" : "OFF" );
    }
  } else if (data.kind == "INT") {
    body = data.value.toString();
  } else if (data.kind == "BYTE") {
    body = data.value.toString();
  }

  let ohItem = 'none';
  if ((data.category == 'WIND') &&
      (data.item == 'avg')) {
    ohItem='GV_Wind_Buiten';
  } else {
    ohItem = data.item
  }

  let options = {
    host: openhabIP, 
    port: openhabPort,
    path: "/rest/items/" + ohItem + "/state",
    method: "PUT",
    headers:  {
      'Content-Type': 'text/plain',
      'Content-Length': body.length
    }
  }

  let req = http.request(options, function(res) {
    let result = '';

    res.on('data', (chunk) => {
      result += chunk;
    }).on('error', (err) => {
      console.log(data.item + "(ERROR) :" + err.stack);
    }).on('end', () => {
      if (result != "") {
        console.log(data.item + " : " + result);
      }
    });
  });
  
  req.write(body);

  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.end();

}

function fetchPlcCategory(catName, callback) {
  let checkVars = ohItems.find({ category : { '$eq' : catName }});
  let allHandles = [checkVars.length];

  for (var i = 0; i < checkVars.length; i++) {
    switch (checkVars[i].kind) {
      case "BOOL":
        allHandles[i] = {
          symname: checkVars[i].plc,
          bytelength: ads.BOOL,
          propname: 'value'
        } 
        break;

      case "INT":
        allHandles[i] = {
          symname: checkVars[i].plc,
          bytelength: ads.INT,
          propname: 'value'
        } 
        break;

      case "BYTE":
        allHandles[i] = {
          symname: checkVars[i].plc,
          bytelength: ads.BYTE,
          propname: 'value'
        } 
        break;
    }
  }
    
  let client = ads.connect(plcOptions, function() {

    this.multiRead(allHandles, function(err, handle) {
      if (err) {
        console.log(err);
        return callback(err.message, "-1"); 
      }

      return callback("", handle);
    });
  });

  client.on('error', function(err)  {
    console.log("client error: " + err);
  })
  //client.end();
}

function checkOpenHabCategory(database, category) {
  jobBusy = true;

  fetchPlcCategory(category, function(err, data)  {
    let influxData = "";

    try {
      data.forEach(element => {
      
        let dbElement = ohItems.find({'plc': { '$eq' : element.symname}});
        let lokiUpdate = false;
        let newHandle = false;
        if (dbElement[0].value != element.value) {
          if (dbElement[0].category == 'TEMP') {            // temperaturen
            dbElement[0].value = (element.value / 10).toFixed(1);
          } else if (dbElement[0].kind == 'BOOL') {
            dbElement[0].value = (element.value ? '1' : '0');
          } else {
            //console.log(element);
            dbElement[0].value = element.value.toFixed(0);
          }
          if (dbElement[0].handle != element.symhandle) {
            dbElement[0].handle = element.symhandle;
            newHandle = true;
          }
          dbElement[0].checktime = Date.now();

          if (dbElement[0].openhab == 1) {
            
            sendOpenhabUpdate(dbElement[0]);

          }

          lokiUpdate = true;
        }

        if (!lokiUpdate) {

          let diff = Math.abs(dbElement[0].checktime - Date.now()) / 1000;

          let minutes = Math.floor(diff / 60) % 60;

          if (minutes >= 10) {
            //console.log(dbElement[0].item + " (" + dbElement[0].category + ") last updated on " + dbElement[0].checktime + " (now = " + Date.now() + ")")
            dbElement[0].checktime = Date.now();
            lokiUpdate = true;
          }
        }
  
        if (lokiUpdate || newHandle) {
          ohItems.update(dbElement[0]);
   
          if (lokiUpdate) {
            influxData = dbElement[0].influxdb + ",item=" + dbElement[0].item + " value=" + dbElement[0].value;
          }
          if (newHandle) {
            influxData = dbElement[0].influxdb + "_log,item=" + dbElement[0].item + " value=" + dbElement[0].value + ",handle=" + dbElement[0].handle;
          }
          sendInfluxUpdate(database, influxData);
          console.log(influxData);


        }
      })

    }
    catch (err) {
      console.log("ERROR checking " + category + ": " + err)
    }
    finally {
      jobBusy = false;
    }
    
  });
}

function calculateNextTime (rule) {
  let tmrStart = moment(rule.time, 'HH:mm:ss');
  let curDay = moment().isoWeekday();
    
  let nextDay = curDay + 1;
  if (moment().isBefore(tmrStart)) {
    nextDay--;
  }

  let dayFound = false;  
  while ((curDay <= nextDay) && (!dayFound)) {
    dayFound = false;
    switch (nextDay % 7) {
      case 1:
        if (rule.ma == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
      case 2:
        if (rule.di == 1) { dayFound = true; } else { dayFound = false; nextDay++;}
        break;
      case 3:
        if (rule.wo == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
      case 4:
        if (rule.do == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
      case 5:
        if (rule.vr == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
      case 6:
        if (rule.za == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
      case 0:
        if (rule.zo == 1) { dayFound = true; } else { dayFound = false; nextDay++; }
        break;
    }
  }
    
  if (rule.random > 0) {
    let randomSeconds = Math.floor(Math.random() * rule.random);
    tmrStart = tmrStart.add(randomSeconds, 'seconds');
  }
 // console.log(rule.item.padEnd(25, ' ') 
 //           + " - " + tmrStart.isoWeekday(nextDay).format('DD-MM-YYYY HH:mm:ss')
 //           + " - " + tmrStart.isoWeekday(nextDay).format('X'));
  return tmrStart.isoWeekday(nextDay).unix();
}

function initTimerQueue() {
  let allRules = tmrRules.find({ 'rowid' : {'$eq' : '-1' }});

  let rowCnt = 1;
  allRules.forEach( tmrRule =>  { 
    
    tmrRule.rowid = rowCnt++;
    tmrRules.update(tmrRule);

    let plcItem = ohItems.find({ 'item' : { '$eq' : tmrRule.item }});
    try {
      let tmrAction = {
        'plc'    : plcItem[0].plc,
        'kind'   : plcItem[0].kind,
        'time'   : calculateNextTime(tmrRule),
        'value'  : tmrRule.value,
        'schema' : tmrRule.schema,
        'ruleId' : tmrRule.rowid,
        'active' : 1
      };
      tmrQueue.insertOne(tmrAction); 
    }
    catch (err) {
      console.error(err);
    }
  });

  console.log('initial timers created');
  setTimeout(processTimerQueue, 5000);
}

function processTimerQueue() {
  setTimeout(processTimerQueue, 5000);

  let curTime = moment().unix();
  let nextTime = moment().add(6, 'seconds').unix();

  let plcNames = [];
  let plcKinds = [];
  let plcValues = [];

  let actions = tmrQueue.find({ 'time' : { '$between' : [curTime, nextTime] }});
//  console.log('check : ' + prevTime + ' - ' + curTime + ' (' + actions.length + ')');
  if (actions.length > 0) {
    actions.forEach(action => {
      let tmrRule = tmrRules.find({ 'rowid' : { '$eq' : action.ruleId }});

      //calc new time
      action.time = calculateNextTime(tmrRule[0]);
      tmrQueue.update(action);

      plcNames.push(action.plc);
      plcKinds.push(action.kind);
      plcValues.push(action.value);
    });

    setPlcSymbols(plcNames, plcKinds, plcValues, function(err, allHandles)  {
      //let outbound;
      if (err) {
        console.error(plcNames.join(',') + ' - ' + err);
      } else {
        allHandles.forEach(element => {
          let updItem = ohItems.find({ plc : { '$eq' : element.symname }});
          if (element.kind == 'BOOL') {
            updItem[0].value = (element.value ? '1' : '0');
          } else {
            updItem[0].value = element.value;
          }
          ohItems.update(updItem[0]);
        });            
      }
    })
  }
}

function processJobQueue() {
  setTimeout(processJobQueue, 250);

  if (jobBusy) {
    //console.log("job still busy!!");
    return;
  }

  let todoList =  jobQueue.find({ isBusy : { '$eq' : 1 }});
  if (todoList.length == 1) {
    jobQueue.remove(todoList[0]);
  }
 
  todoList = jobQueue.find({ isBusy : { '$eq' : 0 }});
  if (todoList.length == 0) {
    return;
  }
  todoList[0].isBusy = 1;
  jobQueue.update(todoList[0]);
  
  checkOpenHabCategory(todoList[0].database, todoList[0].kind);
}

setTimeout(() => {
  processJobQueue();

  initTimerQueue();

}, 1000);

var check_licht = schedule.scheduleJob('2-59/5 * * * * *', function() {
    //console.log("checking licht");

    jobQueue.insert({kind: "LICHT", database: "openhab_db", request: Date.now(), isBusy: 0 });
})

var check_pres = schedule.scheduleJob('4-59/5 * * * * *', function() {
  //console.log("checking presence");

  jobQueue.insert({kind: "ACCESS", database: "openhab_db", request: Date.now(), isBusy: 0 });
})

var check_screens = schedule.scheduleJob('1-59/20 * * * * *', function() {
  //console.log("checking screens");

  jobQueue.insert({kind: "SCREENS", database: "openhab_db", request: Date.now(), isBusy: 0 });
})

var check_sensors = schedule.scheduleJob('1-59/1 * * * *', function() {
  //console.log("checking beckhoff sensors");  

  jobQueue.insert({kind: "TEMP", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
  jobQueue.insert({kind: "LIGHT", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
  jobQueue.insert({kind: "WIND", database: "beckhoff_db", request: Date.now(), isBusy: 0 });
})

/*
 * EXPRESS
 */
function unhandledRequest(req, response, next){
  response.status(400)
    .json({ error: "unhandled request"})
    .end();
}

function setPlcSymbol(plcName, kind, plcValue, callback) {
  let myHandle = {}; 
  
  switch (kind) {
    case "BOOL":
      myHandle = {
        symname: plcName,
        bytelength: ads.BOOL,
        propname: 'value',      
        value: plcValue    
      } 
      break;

    case "INT":
      myHandle = {
        symname: plcName,
        bytelength: ads.INT,
        propname: 'value',      
        value: plcValue    
      } 
      break;

    case "BYTE":
      myHandle = {
        symname: plcName,
        bytelength: ads.BYTE,
        propname: 'value',      
        value: plcValue    
      } 
      break;
  }

  let client = ads.connect(plcOptions, function() {

    this.write(myHandle, function(err) {
      if (err) {
        console.log('write error: ' + err);
      }
      this.read(myHandle, function(err, handle) {
        if (err) {
          console.log('read error' + err);
          return callback(err, "");
        } else {
          //console.log(handle);

          return callback("", handle);
        }
      })
    })
  })
}

function setPlcSymbols(allNames, allKinds, allValues, callback) {
 // let myHandle = {}; 

  //let allNames = plcNames.split(",");
  //let allKinds = kinds.split(",");
  //let allValues = plcValues.split(",");

  let allHandles = [allNames.length];
  
  for (var i = 0; i < plcNames.length; i++) {
    switch (allKinds[i]) {
      case "BOOL":
        allHandles[i] = {
          symname: allNames[i],
          bytelength: ads.BOOL,
          propname: 'value',      
          value: allValues[i]     
        } 
        break;
  
      case "INT":
        allHandles[i] = {
          symname: allNames[i],
          bytelength: ads.INT,
          propname: 'value',      
          value: allValues[i]    
        } 
        break;
  
      case "BYTE":
        allHandles[i] = {
          symname: allNames[i],
          bytelength: ads.BYTE,
          propname: 'value',      
          value: allValues[i]     
        } 
        break;
    }
  }

  let client = ads.connect(plcOptions, function() {

    this.multiWrite(allHandles, function(err) {
      if (err) {
        console.log('write error: ' + err);
      }
      this.multiRead(allHandles, function(err, handles) {
        if (err) {
          console.log('read error' + err);
          return callback(err, "");
        } else {
          //console.log(handle);

          return callback("", handles);
        }
      })
    })
  })
}

function getSymbols(data, callback) {

  let client = ads.connect(plcOptions, function() {
    this.getSymbols(function(err, symbols) {
        if (err) console.log(err)

        console.log(JSON.stringify(symbols, null, 2))
        return callback("", symbols)
    })
  })
} 

function getInfluxData(database, query, callback) {
  
  let options = {
    host: influxIP, 
    port: influxPort,
    path: "/query?pretty=true&db=" + database + "&u=" + influxUser + "&p=" + influxPass + "&epoch=s&q=" + query,
    method: "GET"
  }

  let req = http.request(options, function(res) {
    let result = '';

    res.on('data', (chunk) => {
      result += chunk;
    }).on('error', (err) => {
     
      console.log('error querying data: ' + err);
      callback(err, null);
    }).on('end', () => {

      callback(null, result);
    });
  });

  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.end();
}

app.get('/test', function(req, res) {
  jobQueue.insert({kind: "LICHT", database: "openhab_db", request: Date.now(), isBusy: 0 });
})

app.get('/setSwitch', function(req, res) {
	
  let varName = req.query.var;
  let switchValue = req.query.state;
  let updItem = ohItems.find({ item : { '$eq' : varName }});
  
	setPlcSymbol(updItem[0].plc, updItem[0].kind, switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error" : err
		  };
	  } else {
      outbound =  {
		    "name" : varName,
				"value" : data.value,
				"handle" : data.symhandle
      };
      
      //let updItem = ohItems.find({ plc : { '$eq' : data.symname }});
      updItem[0].value = (data.value ? '1' : '0');
      ohItems.update(updItem[0]);
      //console.log(updItem);
	  }
	  console.log('setSwitch: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/setDimmer', function(req, res) {
	
  let varName = req.query.var;
  let switchValue = req.query.state;
  let updItem = ohItems.find({ item : { '$eq' : varName }});
  
	setPlcSymbol(updItem[0].plc, updItem[0].kind, switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error": err
		  };
	  } else {
      outbound =  {
		    "name" : varName,
				"value" : data.value,
				"handle" : data.symhandle
      };
      
      //let updItem = ohItems.find({ plc : { '$eq' : data.symname }});
      updItem[0].value = data.value;
      ohItems.update(updItem[0]);
	  }
	  console.log('setDimmer: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});

})

/*
app.get('/setScreenAuto', function(req, res) {
	let varName = req.query.var;
  let switchValue = req.query.state;

  console.log('scr_auto : ' + varName + ' (' + switchValue + ')');
	setPlcSymbol('SCREENS.' + varName, 'BOOL', switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error" : err
		  };
	  } else {
      outbound =  {
		    "name" : data.symname.replace('SCREENS.', ''),
				"value" : data.value,
				"handle" : data.symhandle
      };
      
      let updItem = ohItems.find({ plc : { '$eq' : data.symname }});
      updItem[0].value = (data.value ? '1' : '0');
      ohItems.update(updItem[0]);
	  }
	  console.log('setScreenAuto: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
  });
  
})
*/

app.get('/setScreenPos', function(req, res) {
	let varName = req.query.var;
  let switchValue = req.query.state;
  let updItem = ohItems.find({ item : { '$eq' : varName }});
  
	setPlcSymbol(updItem[0].plc, updItem[0].kind, switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error" : err
		  };
	  } else {
      outbound =  {
		    "name" : varName,
				"value" : data.value,
				"handle" : data.symhandle
      };
      
      //let updItem = ohItems.find({ plc : { '$eq' : data.symname }});
      updItem[0].value = data.value;
      ohItems.update(updItem[0]);
	  }
	  console.log('setScreen: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/updateValues', function(req, res) {
  let catName = req.query.var;

  let checkVars = ohItems.find({ category : { '$eq' : catName }});

  checkVars.forEach(element => {
    console.log(JSON.stringify(element));
    sendOpenhabUpdate(element);
  });

  res.status(200).end();
})

app.get('/getValues', function(req, res) {
  let catName = req.query.var;
  
  let outbound = [];

  let checkVars = ohItems.find({ category : { '$eq' : catName }});

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

app.get('/getGinlong', function(req, res) {
  //687941b05cef64715cef64718103050305c8cbcc009b2100004e5d2c5b010092b400003131304138303137413232303130343019017d0e1a0008000000000000000c0000000000410985131c0100000a0000006c75000000000000030000000000be21045800db0000000000000000001027200100e90100380200fb0100000000000ba8091616

  //let query = 'SELECT%20e_total,%20e_today%20FROM%20pv_data%20WHERE%20serial="110A8017A2201040"%20order%20by%20time%20desc%20limit%201';
  let database = 'ginlong_db';
  let query = 'SELECT%20e_total%2Ce_today%2Cserial%20FROM%20pv_data%20ORDER%20BY%20time%20DESC%20LIMIT%201'
  
  getInfluxData(database, query, function(err, data) {
    let outbound = '';

    if (err) {
      outbound = 'error detected: ' + err;
    } else {
      //console.log('getGinlong : ' + data);
      let tmpData = JSON.parse(data);
      outbound = {
        'e_total' : tmpData.results[0].series[0].values[0][1],
        'e_today' : tmpData.results[0].series[0].values[0][2],
        'serial' : tmpData.results[0].series[0].values[0][3],
        'time' : tmpData.results[0].series[0].values[0][0]
      };

      let logTime = moment.unix(tmpData.results[0].series[0].values[0][0]);
      let difference = moment().diff(logTime, 'seconds');

      console.log('lastTime = ' + logTime.toString('') + ' - diff = ' + difference);
      if (difference >= 3600) {
        let e_today = 0;
        if (logTime.isoWeekday() == moment().isoWeekday()) {
          e_today = tmpData.results[0].series[0].values[0][2];
        }

        let influxData='pv_data,serial=' + tmpData.results[0].series[0].values[0][3] 
          + ' temp=0.0' 
          + ',vpv1=0.0,vpv2=0.0'  
          + ',ipv1=0.0,ipv2=0.0'  
          + ',iac1=0.0,iac2=0.0,iac3=0.0' 
          + ',vac1=0.0,vac2=0.0,vac3=0.0' 
          + ',fac=0.0,pac=0.0'  
          + ',e_today='+ e_today.toFixed(1) + ',e_total=' + tmpData.results[0].series[0].values[0][1].toFixed(1)
          + ',ppv=0.0';
 
        sendInfluxUpdate('ginlong_db', influxData);
      }
    }
    //console.log(JSON.stringify(data));
    res.status(200).json(outbound).end();
  });

})

app.get('/getSymbols', function(req, res) {

	getSymbols(null, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    name: req.params.varName,
		    error: err,
		    temp: -999
		  };
	  } else {
			outbound = data;
		}
	  console.log('getSymbols: %s', JSON.stringify(data));

	  res.status(200).json(outbound).end();
	});
	//console.log(res);
})

app.use(unhandledRequest);

var server = app.listen(expressPort, function() {
	var srvHost = server.address().address
	var srvPort = server.address().port
	
	console.log("beckhoff app listening at http://%s:%s", srvHost, srvPort);
})

function shutdown() {
  console.log('exiting... ');
  server.close(function() {
    console.log('closed express');
  })
}

process.on('exit', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => {
  console.log('Caught exception:' + err);
});
