var loki = require('lokijs');
var http = require('http');
var moment = require('moment');

const openhabIP = "10.81.20.60";
const openhabPort = 8080;

moment().format();
var lokiDB = new loki("openhab_data.json");
var ohItems = lokiDB.addCollection('openhab', { indices : ['category'], unique: ['item'] });

function prepareBeckhoffCategoryRequest(category) {
  let allData = ohItems.find({ 'category' : { '$eq' : category }});
  let handles = [];

  allData.forEach(element => {
    let handle = {
      'symname'    : element.plc,
     // 'symhandle'  : element.handle,
      'propname'   : 'value',
      'bytelength' : element.kind
    };

    handles.push(handle);
  });

  return handles;  
}

function prepareBeckhoffItemRequest(item, value) {
  let thisData = ohItems.find({ 'item' : { '$eq' : item }});

  let handle = {
    'symname'    : thisData[0].plc,
    //'symhandle'  : thisData.handle,
    'propname'   : 'value',
    'value'      : value,
    'bytelength' : thisData[0].kind
  };

  return handle;
}

function prepareOpenhabUpdate(filter) {
  let ohUpdate = [];

  //let allData = ohItems.find({ 'category' : { '$in' : filter }});
  let unix10min = moment().add(-10, 'minutes').unix();

 // let allData = ohItems.find({ '$and' : [{ 'category' : { '$in' : filter }}, { 'openhab' : { '$eq' : 1 }},
 //                                        { '$or' : [{ 'changed' : { '$eq' : 1 }},  { 'checktime' : { '$gte' : unix10min }}]}
 //                                       ]
 //                             });
  let allData = ohItems.find({ 'openhab' : { '$eq' : '1' }});
  
  if (allData.length == 0) {
    return "";
  }

  allData.forEach(element => {
    let value = '';

    if ((element.changed == '0') && (element.checktime > unix10min)) {
      return;
    }
    switch (element.kind) {
      case "BOOL":
        if (element.category == "ACCESS") {
          value = (element.value ? "CLOSED" : "OPEN" );
        } else {
          value = (element.value ? "ON" : "OFF" );
        }
        break;
      case "BYTE":
        value = element.value.toString();
        break;
      case "INT":
        if (element.category == "TEMP") {
          value = (element.value / 10).toString();
        } else  {
          value = element.value.toString();
        }
        break;
    }

    let updItem = {
      'item'  : element.item,
      'value' : value
    }

    if ((element.category == 'WIND') &&
        (element.item == 'avg')) {
      updItem.item = 'GV_Wind_Buiten';
    }

    ohUpdate.push(updItem);

    element.changed = '0';
    ohItems.update(element);
  });

  return ohUpdate;

}

function sendOpenhabUpdate (data) {
  
  let options = {
    host: openhabIP, 
    port: openhabPort,
    path: "/rest/items/" + data.item + "/state",
    method: "PUT",
    headers:  {
      'Content-Type': 'text/plain',
      'Content-Length': data.value.length
    }
  }

//  console.log(JSON.stringify(options));

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

  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.write(data.value);  

  req.end();
}

function doLokiUpdate(plcData, curTime) {
  let updItem = ohItems.find({ plc : { '$eq' : plcData.symname }});

  let updValue = false;
  let updHandle = false;

  //console.log(plcData.symname + ' : ' + plcData.value);
  if (updItem[0].value != plcData.value) {
    updItem[0].value = plcData.value;
    updItem[0].checktime = curTime;
    updItem[0].changed = '1';

    updValue = true;
  }

  // store a sample at least every 10min 
  if ((curTime - updItem[0].checktime) >= 600) {
    updItem[0].checktime = curTime;
    updItem[0].changed = '1';

    updValue = true;
  }
     
  // store whenever a handle to a plc object changes
  if (updItem[0].symhandle != plcData.symhandle) {
    updItem[0].symhandle = plcData.symhandle;

    updHandle = true;
  }
  
  // perform the update in the in-memory loki-db
  ohItems.update(updItem[0]);

  if (updItem[0].kind == 'BOOL') {
    plcData.value = (plcData.value ? '1' : '0');
  } else if (updItem[0].category == 'TEMP') {
    plcData.value = (plcData.value / 10).toFixed(1)
  } else {
    plcData.value = plcData.value.toFixed(0);
  }
 
  // if any update, pass back data to be stored in the influx database
  if (updValue || updHandle) {
    let influxData = {
      'measure' : updItem[0].influxdb,
      'item'    : updItem[0].item,
      'kind'    : updItem[0].kind,
      'value'   : plcData.value,
      'handle'  : 0
    }

    //if (updValue) {
    //  influxData.value = plcData.value;
    //}
    if (updHandle) {
    //  influxData.value = plcData.value;
      influxData.handle = plcData.symhandle;
    }
    return influxData;
  } else {
    return "";
  }
}

module.exports = {
  ohItems     : ohItems,
  getCategory : prepareBeckhoffCategoryRequest,
  getItem     : prepareBeckhoffItemRequest,
  getUpdates  : prepareOpenhabUpdate,
  sendUpdate  : sendOpenhabUpdate,
  localUpdate : doLokiUpdate
}