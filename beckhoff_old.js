var express = require('express');
var schedule = require('node-schedule');
var loki = require('lokijs');
var bodyParser = require('body-parser');


/*
 * orig section
 */
var adsapi = require('./actions');
const port = 3000;

var app = express();
app.use(bodyParser.urlencoded({ extended:false }));
app.use(bodyParser.json());

app.get('/pingback', function(req, res) {
	console.log('pingback triggered');
	res.end('pingback!!');
})

app.get('/getTemp', function (req, res) {
	var varNames = req.param('vars').split(",");
	let outbound = [];

	adsapi.getTemp(varNames, function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err,
				"temp": -999
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('SENSORS.', ''),
				  "value" : element.value / 10,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('SENSORS.', ''),
				"value" : data.value / 10,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	 console.log('getTemperature: %s', JSON.stringify(outbound));

	 res.status(200).json(outbound).end();
 });

})

app.get('/getPres', function (req, res) {
	var varNames = req.param('vars').split(",");
	let outbound = [];

	adsapi.getPres(varNames, function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('SENSORS.', ''),
				  "value" : element.value,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('SENSORS.', ''),
				"value" : data.value,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	 console.log('getPresence: %s', JSON.stringify(outbound));

	 res.status(200).json(outbound).end();
 });

})

app.get('/getWind', function(req, res) {

  let varName = req.param('var');

	adsapi.getWind(varName, function(err, data)  {
	  var outbound;
	  if (err) {
      outbound = {
		    "name": element.symname.replace('SENSORS.', ''),
		    "error": err,
		    "speed": 0
		};
	  } else {
      outbound = {
		    "name" : element.symname.replace('SENSORS.', ''),
				"value" : element.value,
				"handle" : element.symhandle
		  };
	  }
	  console.log('getWindSpeed: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
	//console.log(res);
})

app.get('/getSwitch', function(req, res) {
	let varNames = req.param('vars').split(",");

	let outbound = [];
	adsapi.getSwitch(varNames, function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('STURING_LICHT.', ''),
				  "value" : element.value,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('STURING_LICHT.', ''),
				"value" : data.value,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	  console.log('getSwitch: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/setSwitch', function(req, res) {
	
	let varName = req.param('var');
	let switchValue = req.param('state');
	adsapi.setSwitch(varName, switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error" : err
		  };
	  } else {
      outbound =  {
		    "name" : data.symname.replace('STURING_LICHT.', ''),
				"value" : data.value,
				"handle" : data.symhandle
		  };
	  }
	  console.log('setSwitch: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/getScreenAuto', function(req, res) {
	let varNames = req.param('vars').split(",");

	let outbound = [];
	adsapi.getScreenAuto(varNames, function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('SCREENS.', ''),
				  "value" : element.value,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('SCREENS.', ''),
				"value" : data.value,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	  console.log('getScreenAuto: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/setScreenAuto', function(req, res) {
	let varName = req.param('var');
	let switchValue = req.param('state');
	adsapi.setScreenAuto(varName, switchValue, function(err, data)  {
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
	  }
	  console.log('setScreenAuto: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/getScreenPos', function(req, res) {
	let varNames = req.param('vars').split(",");

	let outbound = [];
	adsapi.getScreen(varNames, function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('SCREENS.', ''),
				  "value" : element.value,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('SCREENS.', ''),
				"value" : data.value,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	  console.log('getScreen: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/setScreenPos', function(req, res) {
	let varName = req.param('var');
	let switchValue = req.param('state');
	adsapi.setScreen(varName, switchValue, function(err, data)  {
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
	  }
	  console.log('setScreen: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/getDimmer', function(req, res) {
	let varNames = req.param('vars');

	let outbound = [];
	adsapi.getDimmer(varNames.split(","), function(err, data)  {
	
		if (err) {
			outbound = {
				"name": varNames,
				"error": err
		 };
	} else {
		if (data.constructor === Array) {
      data.forEach(element => {
			  let item = {
				  "name" : element.symname.replace('STURING_LICHT.', ''),
				  "value" : element.value,
				  "handle" : element.symhandle
			  }

			  outbound.push(item);
		  });
		} else {
      let item = {
				"name" : data.symname.replace('STURING_LICHT.', ''),
				"value" : data.value,
				"handle" : data.symhandle
			}

			outbound.push(item);
		}

	 }
	  console.log('getDimmer: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
})

app.get('/setDimmer', function(req, res) {
	
	let varName = req.param('var');
	let switchValue = req.param('state');
	adsapi.setDimmer(varName, switchValue, function(err, data)  {
	  let outbound;
	  if (err) {
      outbound = {
		    "name" : varName,
		    "error": err
		  };
	  } else {
      outbound =  {
		    "name" : data.symname.replace('STURING_LICHT.', ''),
				"value" : data.value,
				"handle" : data.symhandle
		  };
	  }
	  console.log('setDimmer: %s', JSON.stringify(outbound));

	  res.status(200).json(outbound).end();
	});
	//console.log(res);
})

app.get('/getSymbols', function(req, res) {

	adsapi.getSymbols(null, function(err, data)  {
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

app.get('/notify', function(req, res) {
	let varNames = req.param('vars').split(",");
	let dataTypes = req.param('kinds').split(",");
	let itemNames = req.param('items').split(",");

	
	for (var i = 0; i < varNames.length; i++) {
	  adsapi.recvSensor(varNames[i], dataTypes[i], itemNames[i], function(err,data) {
		  if (err) {
        res.status(400).json("error: " + err.toString()).end();
		  } else {
			  res.status(200).json(data).end();
		  }
	  })
  }
})

function unhandledRequest(req, response, next){
  response.status(400)
    .json({ error: "unhandled request"})
    .end();
}

//app.get('/getTemperature', getTemperature);
app.use(unhandledRequest);


var server = app.listen(port, function() {
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
