var http = require('http');

const influxIP = "10.81.20.55";
const influxPort = 8086;
const influxUser = "nodejs";
const influxPass = "Node.JS";


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
    
  req.on('error', (err) => {
    console.error(data.item + "(ERROR) :" + err.stack);
  });

  req.write(data);

  req.end();
}

function prepareInfluxUpdate(data) {
  let result = '';

  result = data.measure + ',item=' + data.item + ' value=' + data.value;

  if (data.handle != 0) {
    result += '\n' + data.measure + '_log,item=' + data.item + ' value=' + data.value + ',handle=' + data.handle;
  }

  return result;
}

module.exports = {
  sendUpdate : sendInfluxUpdate,
  prepareUpdate : prepareInfluxUpdate
}