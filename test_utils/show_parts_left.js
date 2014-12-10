var Datastore = require('nedb');
var path = require('path');

var parts_left_collection = new Datastore({
  filename: path.join(path.dirname(path.dirname(__filename)), "parts_left"),
  autoload: true
});

parts_left_collection.find(
  {},
  function(err, docs) {
    docs.forEach(function(doc){
      console.log(doc);
    });
  }
);
