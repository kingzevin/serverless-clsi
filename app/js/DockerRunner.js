//@ sourceMappingURL=DockerRunner.map
// Generated by CoffeeScript 1.6.0
(function() {
  var Docker, DockerRunner, LockManager, Path, Settings, async, crypto, dockerode, fs, logger, oneHour, usingSiblingContainers, _,
    __slice = [].slice;

  Settings = require("settings-sharelatex");

  logger = require("logger-sharelatex");

  Docker = require("dockerode");

  dockerode = new Docker();

  crypto = require("crypto");

  async = require("async");

  LockManager = require("./DockerLockManager");

  fs = require("fs");

  Path = require('path');

  _ = require("underscore");

  logger.info("using docker runner");

  usingSiblingContainers = function() {
    var _ref;
    return (Settings != null ? (_ref = Settings.path) != null ? _ref.sandboxedCompilesHostDir : void 0 : void 0) != null;
  };

  module.exports = DockerRunner = {
    ERR_NOT_DIRECTORY: new Error("not a directory"),
    ERR_TERMINATED: new Error("terminated"),
    ERR_EXITED: new Error("exited"),
    ERR_TIMED_OUT: new Error("container timed out"),
    run: function(project_id, command, directory, image, timeout, environment, callback) {
      var arg, fingerprint, img, name, options, volumes, _newPath;
      if (callback == null) {
        callback = function(error, output) {};
      }
      if (usingSiblingContainers()) {
        _newPath = Settings.path.sandboxedCompilesHostDir;
        logger.log({
          path: _newPath
        }, "altering bind path for sibling containers");
        directory = Path.join(Settings.path.sandboxedCompilesHostDir, Path.basename(directory));
      }
      volumes = {};
      volumes[directory] = "/compile";
      command = (function() {
        var _base, _i, _len, _results;
        _results = [];
        for (_i = 0, _len = command.length; _i < _len; _i++) {
          arg = command[_i];
          _results.push(typeof (_base = arg.toString()).replace === "function" ? _base.replace('$COMPILE_DIR', "/compile") : void 0);
        }
        return _results;
      })();
      if (image == null) {
        image = Settings.clsi.docker.image;
      }
      if (Settings.texliveImageNameOveride != null) {
        img = image.split("/");
        image = "" + Settings.texliveImageNameOveride + "/" + img[2];
      }
      options = DockerRunner._getContainerOptions(command, image, volumes, timeout, environment);
      fingerprint = DockerRunner._fingerprintContainer(options);
      options.name = name = "project-" + project_id + "-" + fingerprint;
      logger.log({
        project_id: project_id
      }, "running docker container");
      DockerRunner._runAndWaitForContainer(options, volumes, timeout, function(error, output) {
        var _ref;
        if (error != null ? (_ref = error.message) != null ? _ref.match("HTTP code is 500") : void 0 : void 0) {
          logger.log({
            err: error,
            project_id: project_id
          }, "error running container so destroying and retrying");
          return DockerRunner.destroyContainer(name, null, true, function(error) {
            if (error != null) {
              return callback(error);
            }
            return DockerRunner._runAndWaitForContainer(options, volumes, timeout, callback);
          });
        } else {
          return callback(error, output);
        }
      });
      return name;
    },
    kill: function(container_id, callback) {
      var container;
      if (callback == null) {
        callback = function(error) {};
      }
      logger.log({
        container_id: container_id
      }, "sending kill signal to container");
      container = dockerode.getContainer(container_id);
      return container.kill(function(error) {
        var _ref;
        if ((error != null) && (error != null ? (_ref = error.message) != null ? typeof _ref.match === "function" ? _ref.match(/Cannot kill container .* is not running/) : void 0 : void 0 : void 0)) {
          logger.warn({
            err: error,
            container_id: container_id
          }, "container not running, continuing");
          error = null;
        }
        if (error != null) {
          logger.error({
            err: error,
            container_id: container_id
          }, "error killing container");
          return callback(error);
        } else {
          return callback();
        }
      });
    },
    _runAndWaitForContainer: function(options, volumes, timeout, _callback) {
      var attachStreamHandler, callback, callbackIfFinished, containerReturned, name, output, streamEnded;
      if (_callback == null) {
        _callback = function(error, output) {};
      }
      callback = function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        _callback.apply(null, args);
        return _callback = function() {};
      };
      name = options.name;
      streamEnded = false;
      containerReturned = false;
      output = {};
      callbackIfFinished = function() {
        if (streamEnded && containerReturned) {
          return callback(null, output);
        }
      };
      attachStreamHandler = function(error, _output) {
        if (error != null) {
          return callback(error);
        }
        output = _output;
        streamEnded = true;
        return callbackIfFinished();
      };
      return DockerRunner.startContainer(options, volumes, attachStreamHandler, function(error, containerId) {
        if (error != null) {
          return callback(error);
        }
        return DockerRunner.waitForContainer(name, timeout, function(error, exitCode) {
          var err, _ref;
          if (error != null) {
            return callback(error);
          }
          if (exitCode === 137) {
            err = DockerRunner.ERR_TERMINATED;
            err.terminated = true;
            return callback(err);
          }
          if (exitCode === 1) {
            err = DockerRunner.ERR_EXITED;
            err.code = exitCode;
            return callback(err);
          }
          containerReturned = true;
          if (options != null) {
            if ((_ref = options.HostConfig) != null) {
              _ref.SecurityOpt = null;
            }
          }
          logger.log({
            err: err,
            exitCode: exitCode,
            options: options
          }, "docker container has exited");
          return callbackIfFinished();
        });
      });
    },
    _getContainerOptions: function(command, image, volumes, timeout, environment) {
      var dockerVol, dockerVolumes, env, hostVol, key, m, options, src, timeoutInSeconds, value, year, _i, _len, _ref, _ref1;
      timeoutInSeconds = timeout / 1000;
      dockerVolumes = {};
      for (hostVol in volumes) {
        dockerVol = volumes[hostVol];
        dockerVolumes[dockerVol] = {};
        if (volumes[hostVol].slice(-3).indexOf(":r") === -1) {
          volumes[hostVol] = "" + dockerVol + ":rw";
        }
      }
      env = {};
      _ref = [Settings.clsi.docker.env, environment || {}];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        src = _ref[_i];
        for (key in src) {
          value = src[key];
          env[key] = value;
        }
      }
      if (m = image.match(/:([0-9]+)\.[0-9]+/)) {
        year = m[1];
      } else {
        year = "2014";
      }
      env['PATH'] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/texlive/" + year + "/bin/x86_64-linux/";
      options = {
        "Cmd": command,
        "Image": image,
        "Volumes": dockerVolumes,
        "WorkingDir": "/compile",
        "NetworkDisabled": true,
        "Memory": 1024 * 1024 * 1024 * 1024,
        "User": Settings.clsi.docker.user,
        "Env": (function() {
          var _results;
          _results = [];
          for (key in env) {
            value = env[key];
            _results.push("" + key + "=" + value);
          }
          return _results;
        })(),
        "HostConfig": {
          "Binds": (function() {
            var _results;
            _results = [];
            for (hostVol in volumes) {
              dockerVol = volumes[hostVol];
              _results.push("" + hostVol + ":" + dockerVol);
            }
            return _results;
          })(),
          "LogConfig": {
            "Type": "none",
            "Config": {}
          },
          "Ulimits": [
            {
              'Name': 'cpu',
              'Soft': timeoutInSeconds + 5,
              'Hard': timeoutInSeconds + 10
            }
          ],
          "CapDrop": "ALL",
          "SecurityOpt": ["no-new-privileges"]
        }
      };
      if (((_ref1 = Settings.path) != null ? _ref1.synctexBinHostPath : void 0) != null) {
        options["HostConfig"]["Binds"].push("" + Settings.path.synctexBinHostPath + ":/opt/synctex:ro");
      }
      if (Settings.clsi.docker.seccomp_profile != null) {
        options.HostConfig.SecurityOpt.push("seccomp=" + Settings.clsi.docker.seccomp_profile);
      }
      return options;
    },
    _fingerprintContainer: function(containerOptions) {
      var json;
      json = JSON.stringify(containerOptions);
      return crypto.createHash("md5").update(json).digest("hex");
    },
    startContainer: function(options, volumes, attachStreamHandler, callback) {
      return LockManager.runWithLock(options.name, function(releaseLock) {
        return DockerRunner._checkVolumes(options, volumes, function(err) {
          if (err != null) {
            return releaseLock(err);
          }
          return DockerRunner._startContainer(options, volumes, attachStreamHandler, releaseLock);
        });
      }, callback);
    },
    _checkVolumes: function(options, volumes, callback) {
      var checkVolume, jobs, vol, _fn;
      if (callback == null) {
        callback = function(error, containerName) {};
      }
      if (usingSiblingContainers()) {
        return callback(null);
      }
      checkVolume = function(path, cb) {
        return fs.stat(path, function(err, stats) {
          if (err != null) {
            return cb(err);
          }
          if (!(stats != null ? stats.isDirectory() : void 0)) {
            return cb(DockerRunner.ERR_NOT_DIRECTORY);
          }
          return cb();
        });
      };
      jobs = [];
      _fn = function(vol) {
        return jobs.push(function(cb) {
          return checkVolume(vol, cb);
        });
      };
      for (vol in volumes) {
        _fn(vol);
      }
      return async.series(jobs, callback);
    },
    _startContainer: function(options, volumes, attachStreamHandler, callback) {
      var container, createAndStartContainer, name, startExistingContainer;
      if (callback == null) {
        callback = (function(error, output) {});
      }
      callback = _.once(callback);
      name = options.name;
      logger.log({
        container_name: name
      }, "starting container");
      container = dockerode.getContainer(name);
      createAndStartContainer = function() {
        return dockerode.createContainer(options, function(error, container) {
          if (error != null) {
            return callback(error);
          }
          return startExistingContainer();
        });
      };
      startExistingContainer = function() {
        return DockerRunner.attachToContainer(options.name, attachStreamHandler, function(error) {
          if (error != null) {
            return callback(error);
          }
          return container.start(function(error) {
            if ((error != null) && (error != null ? error.statusCode : void 0) !== 304) {
              return callback(error);
            } else {
              return callback();
            }
          });
        });
      };
      return container.inspect(function(error, stats) {
        if ((error != null ? error.statusCode : void 0) === 404) {
          return createAndStartContainer();
        } else if (error != null) {
          logger.err({
            container_name: name,
            error: error
          }, "unable to inspect container to start");
          return callback(error);
        } else {
          return startExistingContainer();
        }
      });
    },
    attachToContainer: function(containerId, attachStreamHandler, attachStartCallback) {
      var container;
      container = dockerode.getContainer(containerId);
      return container.attach({
        stdout: 1,
        stderr: 1,
        stream: 1
      }, function(error, stream) {
        var MAX_OUTPUT, createStringOutputStream, stderr, stdout;
        if (error != null) {
          logger.error({
            err: error,
            container_id: containerId
          }, "error attaching to container");
          return attachStartCallback(error);
        } else {
          attachStartCallback();
        }
        logger.log({
          container_id: containerId
        }, "attached to container");
        MAX_OUTPUT = 1024 * 1024;
        createStringOutputStream = function(name) {
          return {
            data: "",
            overflowed: false,
            write: function(data) {
              if (this.overflowed) {
                return;
              }
              if (this.data.length < MAX_OUTPUT) {
                return this.data += data;
              } else {
                logger.error({
                  container_id: containerId,
                  length: this.data.length,
                  maxLen: MAX_OUTPUT
                }, "" + name + " exceeds max size");
                this.data += "(...truncated at " + MAX_OUTPUT + " chars...)";
                return this.overflowed = true;
              }
            }
          };
        };
        stdout = createStringOutputStream("stdout");
        stderr = createStringOutputStream("stderr");
        container.modem.demuxStream(stream, stdout, stderr);
        stream.on("error", function(err) {
          return logger.error({
            err: err,
            container_id: containerId
          }, "error reading from container stream");
        });
        return stream.on("end", function() {
          return attachStreamHandler(null, {
            stdout: stdout.data,
            stderr: stderr.data
          });
        });
      });
    },
    waitForContainer: function(containerId, timeout, _callback) {
      var callback, container, timedOut, timeoutId;
      if (_callback == null) {
        _callback = function(error, exitCode) {};
      }
      callback = function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        _callback.apply(null, args);
        return _callback = function() {};
      };
      container = dockerode.getContainer(containerId);
      timedOut = false;
      timeoutId = setTimeout(function() {
        timedOut = true;
        logger.log({
          container_id: containerId
        }, "timeout reached, killing container");
        return container.kill(function() {});
      }, timeout);
      logger.log({
        container_id: containerId
      }, "waiting for docker container");
      return container.wait(function(error, res) {
        if (error != null) {
          clearTimeout(timeoutId);
          logger.error({
            err: error,
            container_id: containerId
          }, "error waiting for container");
          return callback(error);
        }
        if (timedOut) {
          logger.log({
            containerId: containerId
          }, "docker container timed out");
          error = DockerRunner.ERR_TIMED_OUT;
          error.timedout = true;
          return callback(error);
        } else {
          clearTimeout(timeoutId);
          logger.log({
            container_id: containerId,
            exitCode: res.StatusCode
          }, "docker container returned");
          return callback(null, res.StatusCode);
        }
      });
    },
    destroyContainer: function(containerName, containerId, shouldForce, callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      return LockManager.runWithLock(containerName, function(releaseLock) {
        return DockerRunner._destroyContainer(containerId || containerName, shouldForce, releaseLock);
      }, callback);
    },
    _destroyContainer: function(containerId, shouldForce, callback) {
      var container;
      if (callback == null) {
        callback = function(error) {};
      }
      logger.log({
        container_id: containerId
      }, "destroying docker container");
      container = dockerode.getContainer(containerId);
      return container.remove({
        force: shouldForce === true
      }, function(error) {
        if ((error != null) && (error != null ? error.statusCode : void 0) === 404) {
          logger.warn({
            err: error,
            container_id: containerId
          }, "container not found, continuing");
          error = null;
        }
        if (error != null) {
          logger.error({
            err: error,
            container_id: containerId
          }, "error destroying container");
        } else {
          logger.log({
            container_id: containerId
          }, "destroyed container");
        }
        return callback(error);
      });
    },
    MAX_CONTAINER_AGE: Settings.clsi.docker.maxContainerAge || (oneHour = 60 * 60 * 1000),
    examineOldContainer: function(container, callback) {
      var age, created, maxAge, name, now, ttl, _ref;
      if (callback == null) {
        callback = function(error, name, id, ttl) {};
      }
      name = container.Name || ((_ref = container.Names) != null ? _ref[0] : void 0);
      created = container.Created * 1000;
      now = Date.now();
      age = now - created;
      maxAge = DockerRunner.MAX_CONTAINER_AGE;
      ttl = maxAge - age;
      logger.log({
        containerName: name,
        created: created,
        now: now,
        age: age,
        maxAge: maxAge,
        ttl: ttl
      }, "checking whether to destroy container");
      return callback(null, name, container.Id, ttl);
    },
    destroyOldContainers: function(callback) {
      if (callback == null) {
        callback = function(error) {};
      }
      return dockerode.listContainers({
        all: true
      }, function(error, containers) {
        var container, jobs, _fn, _i, _len, _ref;
        if (error != null) {
          return callback(error);
        }
        jobs = [];
        _ref = containers || [];
        _fn = function(container) {
          return DockerRunner.examineOldContainer(container, function(err, name, id, ttl) {
            if (name.slice(0, 9) === '/project-' && ttl <= 0) {
              return jobs.push(function(cb) {
                return DockerRunner.destroyContainer(name, id, false, function() {
                  return cb();
                });
              });
            }
          });
        };
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          container = _ref[_i];
          _fn(container);
        }
        return async.series(jobs, callback);
      });
    },
    startContainerMonitor: function() {
      var randomDelay;
      logger.log({
        maxAge: DockerRunner.MAX_CONTAINER_AGE
      }, "starting container expiry");
      randomDelay = Math.floor(Math.random() * 5 * 60 * 1000);
      return setTimeout(function() {
        return setInterval(function() {
          return DockerRunner.destroyOldContainers();
        }, oneHour = 60 * 60 * 1000);
      }, randomDelay);
    }
  };

  DockerRunner.startContainerMonitor();

}).call(this);
