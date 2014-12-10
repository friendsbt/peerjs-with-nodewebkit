/*
为了能存储进度信息, 把必要的函数搬了过来, 这部分已经存在于FBT中了
 */
var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

function update_parts_left(hash, parts_left) {
  global.parts_left_collection.update(
    {hash: parseInt(hash)},
    {$set: {parts_left: parts_left}},
    {'multi': true, 'upsert': true},
    function (err, numReplaced) {
      if (numReplaced !== 1) {
        global.log.info("found duplicate parts_left docs");
      }
      global.parts_left_collection.findOne(
        {hash: parseInt(hash)},
        function(err, doc) {
          browserWindow.console.log(doc);
        }
      );
    }
  );
}

function remove_part_from_parts_left(hash, index) {
  global.parts_left_collection.update(
    {hash: parseInt(hash)},
    {$pull: {parts_left: index}},
    {},
    function (err, numReplaced) {
      if (numReplaced !== 1) {
        global.log.info("found duplicate parts_left docs");
      }
      global.parts_left_collection.findOne(
        {hash: parseInt(hash)},
        function(err, doc) {
          browserWindow.console.log(doc);
        }
      );
    }
  );
}

function remove_record_from_parts_left(hash) {
  global.parts_left_collection.remove(
    {hash: parseInt(hash)},
    {'multi': true},
    function (err, numReplaced) {
      if (numReplaced === 0) {
        global.log.info("no such record in parts_left");
      }
      global.parts_left_collection.findOne(
        {hash: parseInt(hash)},
        function(err, doc) {
          browserWindow.console.log(doc);
        }
      );
    }
  );
}

function record_uploader(hash, uploader_id) {
  global.parts_left_collection.update(
    {hash: parseInt(hash)},
    {$addToSet: {uploaders: uploader_id}},  // append to Array
    {'multi': true, 'upsert': true},
    function (err, numReplaced) {
      if (numReplaced !== 1) {
        global.log.info("found duplicate parts_left docs");
      }
      global.parts_left_collection.findOne(
        {hash: parseInt(hash)},
        function(err, doc) {
          browserWindow.console.log(doc);
        }
      );
    }
  );
}

exports.update_parts_left = update_parts_left;
exports.remove_record_from_parts_left = remove_record_from_parts_left;
exports.record_uploader = record_uploader;
