var loki = require('lokijs');
var http = require('http');

const openhabIP = "10.81.20.60";
const openhabPort = 8080;

var lokiDB = new loki("openhab_data.json");
var ohItems = lokiDB.addCollection('rules');


function prepareBeckhoffRequest(category) {
  let allData = ohItems.find({ 'category' : { '$eq' : category }});
  let handles = [];

  allData.forEach(element => {
    let handle = {
      'symname'    : element.plc,
      //'symhandle'  : element.handle,
      'propname'   : 'value',
      'bytelength' : 0
    };

    handles.push(handle);
  });

  return handles;  
}

function prepareOpenhabUpdate(filter) {
  let ohUpdate = [];

  //let allData = ohItems.find({ 'category' : { '$in' : filter }});
  let unix10min = moment().add(10, 'minutes').unix();

  let allData = ohItems.find({ '$and' : [{ 'category' : { '$in' : filter }},
                               { '$or' : [{ 'changed' : { '$eq' : true }},
                                          { 'checktime' : { '$gte' : unix10min }}]
                                }]
                              });
  
  if (allData.length == 0) {
    return "";
  }

  allData.forEach(element => {
    let value = '';
    switch (element.kind) {
      case "BOOL":
          if (element.category == "ACCESS") {
            value = (element.value ? "CLOSED" : "OPEN" );
          } else {
            value = (element.value ? "ON" : "OFF" );
          }
        break;
      case "BYTE":
        value = element.value;
        break;
      case "INT":
        if (element.category == "TEMP") {
          value = element.value / 10;
        } else  {
          value = element.value;
        }
        break;
    }

    let updItem = {
      'item'  : element.item,
      'value' : value
    }

    if ((element.category == 'WIND') &&
        (elment.item == 'avg')) {
      updItem.item = 'GV_Wind_Buiten';
    }

    ohUpdate.push(updItem);
  })

  /*
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
  */
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

  req.write(data.value);

  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.end();
}

module.exports = {
  ohItems     : ohItems,
  getCategory : prepareBeckhoffRequest,
  getUpdates  : prepareOpenhabUpdate,
  sendUpdate  : sendOpenhabUpdate
}