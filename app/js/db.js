//@ sourceMappingURL=db.map
// Generated by CoffeeScript 1.6.0
(function() {
  var Sequelize, Settings, logger, options, sequelize, _;

  Sequelize = require("sequelize");

  Settings = require("settings-sharelatex");

  _ = require("underscore");

  logger = require("logger-sharelatex");

  options = _.extend({
    logging: false
  }, Settings.mysql.clsi);

  logger.log({
    dbPath: Settings.mysql.clsi.storage
  }, "connecting to db");

  sequelize = new Sequelize(Settings.mysql.clsi.database, Settings.mysql.clsi.username, Settings.mysql.clsi.password, options);

  if (Settings.mysql.clsi.dialect === "sqlite") {
    logger.log("running PRAGMA journal_mode=WAL;");
    sequelize.query("PRAGMA journal_mode=WAL;");
    sequelize.query("PRAGMA synchronous=OFF;");
    sequelize.query("PRAGMA read_uncommitted = true;");
  }

  module.exports = {
    UrlCache: sequelize.define("UrlCache", {
      url: Sequelize.STRING,
      project_id: Sequelize.STRING,
      lastModified: Sequelize.DATE
    }, {
      indexes: [
        {
          fields: ['url', 'project_id']
        }, {
          fields: ['project_id']
        }
      ]
    }),
    Project: sequelize.define("Project", {
      project_id: {
        type: Sequelize.STRING,
        primaryKey: true
      },
      lastAccessed: Sequelize.DATE
    }, {
      indexes: [
        {
          fields: ['lastAccessed']
        }
      ]
    }),
    op: Sequelize.Op,
    sync: function() {
      logger.log({
        dbPath: Settings.mysql.clsi.storage
      }, "syncing db schema");
      return sequelize.sync().then(function() {
        return logger.log("db sync complete");
      })["catch"](function(err) {
        return console.log(err, "error syncing");
      });
    }
  };

}).call(this);