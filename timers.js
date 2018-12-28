var loki = require('lokijs');
var moment = require('moment');

var lokiDB = new loki("timer_data.json");
var tmrRules = lokiDB.addCollection('rules', { indices : ['time'] });

function calculateNextTime (rule) {
    let tmrStart = moment(rule.time, 'HH:mm:ss');
    let curDay = moment().isoWeekday();
      
    let nextDay = curDay + 1;
    if (moment().add(-2, 'seconds').isBefore(tmrStart)) {
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
    console.log(rule.item.padEnd(25, ' ') 
              + " - " + tmrStart.isoWeekday(nextDay).format('DD-MM-YYYY HH:mm:ss'));
    return tmrStart.isoWeekday(nextDay).unix();
}

function initiateTimers() {
  let allRules = tmrRules.find({ 'rowid' : {'$eq' : '-1' }});
  
  let rowCnt = 1;
  let tmrQueue = [];
  allRules.forEach( tmrRule =>  { 
    
    tmrRule.rowid = rowCnt++;
    tmrRules.update(tmrRule);

    //let plcItem = ohItems.find({ 'item' : { '$eq' : tmrRule.item }});
    try {
      let tmrAction = {
        'item'    : tmrRule.item,
        'time'   : calculateNextTime(tmrRule),
        'value'  : tmrRule.value,
        'schema' : tmrRule.schema,
        'ruleId' : tmrRule.rowid,
        'active' : false
        //'active' : (tmrRule.schema.includes('test') ? true : false)
      };
      tmrQueue.push(tmrAction); 
    }
    catch (err) {
      console.error(err);
    }
  });

  console.log('timer rules processed and ready...');
  //setTimeout(processTimerQueue, 5000);

  return tmrQueue;
}

module.exports = {
  rules : tmrRules,
  calculateNextTime : calculateNextTime,
  initiate : initiateTimers
};