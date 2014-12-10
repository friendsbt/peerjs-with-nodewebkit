
var fs = require('fs');

var filesToBeRemoved = ['臆病者.mp3', '臆病者.mp3.tmp', 'parts_left'];

filesToBeRemoved.forEach(function(filename){
  if (fs.existsSync(filename)) {
    fs.unlink(filename);
  }
});
