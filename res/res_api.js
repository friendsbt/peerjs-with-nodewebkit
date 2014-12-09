/*
为了能存储进度信息, 把必要的函数搬了过来, 这部分已经存在于FBT中了
 */
var Datastore = require('nedb');
global.parts_left_collection = new Datastore({filename: "parts_left", autoload: true});

function update_parts_left(hash, parts_left) {
  global.parts_left_collection.update(
    {hash: hash},
    {$set: {parts_left: parts_left}},
    {'multi': true, 'upsert': true},
    function (err, numReplaced) {
      if (numReplaced !== 1) {
        global.log.info("found duplicate parts_left docs");
      }
    }
  );
}

function remove_record_from_parts_left(hash) {
  global.parts_left_collection.remove(
    {hash: hash},
    {'multi': true},
    function (err, numReplaced) {
      if (numReplaced === 0) {
        global.log.info("no such record in parts_left");
      }
    }
  );
}

function record_uploader(hash, uploader_id) {
  global.parts_left_collection.update(
    {hash: hash},
    {$addToSet: {uploaders: uploader_id}},  // append to Array
    {'multi': true, 'upsert': true},
    function (err, numReplaced) {
      if (numReplaced !== 1) {
        global.log.info("found duplicate parts_left docs");
      }
    }
  );
}

exports.update_parts_left = update_parts_left;
exports.remove_record_from_parts_left = remove_record_from_parts_left;
exports.record_uploader = record_uploader;
