var path = require('path');
var fs = require('fs');

var filesToBeRemoved = [
  path.join(path.dirname(path.dirname(__filename)), '臆病者.mp3'),
  path.join(path.dirname(path.dirname(__filename)), '臆病者.mp3.tmp'),
  path.join(path.dirname(path.dirname(__filename)), 'parts_left'),
];

filesToBeRemoved.forEach(function(filename){
  if (fs.existsSync(filename)) {
    fs.unlink(filename);
    console.log(filename, ' removed');
  }
});
