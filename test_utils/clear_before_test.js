var path = require('path');
var fs = require('fs');

var config = JSON.parse(fs.readFileSync('config.json'));
var filepath = config.filepath;

var filesToBeRemoved = [
  path.join(path.dirname(path.dirname(__filename)), filepath),
  path.join(path.dirname(path.dirname(__filename)), filepath + '.tmp'),
  path.join(path.dirname(path.dirname(__filename)), 'parts_left'),
];

filesToBeRemoved.forEach(function(filename){
  if (fs.existsSync(filename)) {
    fs.unlink(filename);
    console.log(filename, ' removed');
  }
});
