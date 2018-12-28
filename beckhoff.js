var ads = require('./node-ads/lib/ads');
var ip = require('ip');

const beckhoffIP = "10.81.20.25";
const localIP = ip.address();

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

function setPlcSymbol(varData, callback) {

  switch (varData.bytelength) {
    case "BOOL":
      varData.bytelength = ads.BOOL;
      break;
    case "INT":
      varData.bytelength = ads.INT;
      break;
    case "BYTE":
      varData.bytelength = ads.BYTE;
      break;
  }

  let client = ads.connect(plcOptions, function() {

    this.write(varData, function(err) {
      if (err) {
        console.log('write error: ' + err);
      }
      this.read(varData, function(err, handle) {
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

function getPlcSymbol(varData, callback) {

  switch (varData.bytelength) {
    case "BOOL":
      varData.bytelength = ads.BOOL;
      break;
    case "INT":
      varData.bytelength = ads.INT;
      break;
    case "BYTE":
      varData.bytelength = ads.BYTE;
      break;
  }

  let client = ads.connect(plcOptions, function() {

    this.read(varData, function(err, handle) {
      if (err) {
        console.error('plc read error: ' + err);
        return callback(err.message, "-1"); 
      }

      return callback("", handle);
    });
  });

  client.on('error', function(err)  {
    console.error("plc client error: " + err);
  });

  client.on('close', function() {
    console.warn('close PLC connection after getSymbol for ' + varData.symname);
  })
}

function setPlcSymbols(varData, callback) {
 
  for (var i = 0; i < varData.length; i++) {

    switch (varData[i].bytelength) {
      case "BOOL":
        varData[i].bytelength = ads.BOOL;
        break;
      case "INT":
        varData[i].bytelength = ads.INT;
        break;
      case "BYTE":
        varData[i].bytelength = ads.BYTE;
        break;
    }
  }
 
   let client = ads.connect(plcOptions, function() {
 
     this.multiWrite(varData, function(err) {
       if (err) {
         console.log('write error: ' + err);
       }
       this.multiRead(varData, function(err, handles) {
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
 
function getPlcSymbols(varData, callback) {
  //let handles = [];

  for (var i = 0; i < varData.length; i++) {

    switch (varData[i].bytelength) {
      case "BOOL":
        varData[i].bytelength = ads.BOOL;
        break;
      case "INT":
        varData[i].bytelength = ads.INT;
        break;
      case "BYTE":
        varData[i].bytelength = ads.BYTE;
        break;
    }
  }

  let client = ads.connect(plcOptions, function() {

    this.multiRead(varData, function(err, handles) {
      if (err) {
        console.error('plc read error: ' + err);
        return callback(err.message, "-1"); 
      }

      return callback("", handles);
    });
  });

  client.on('error', function(err)  {
    console.error("plc client error: " + err);
  });

  client.on('close', function() {
    console.warn('close PLC connection after getSymbol for ' + varData.symname);
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

module.exports = {
  getSymbols    : getSymbols,
  getPlcSymbol  : getPlcSymbol,
  getPlcSymbols : getPlcSymbols,
  setPlcSymbol  : setPlcSymbol,
  setPlcSymbols : setPlcSymbols
}