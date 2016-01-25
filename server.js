/*jslint browser: true, regexp: true */
/*global require, process, console */
var express = require('express');
var fs = require('fs');

var Blackhole = function () {
	'use strict';

	var sendXML,
		self = this;

	self.setupVariables = function () {
		self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
		self.port = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 8080;

		if (typeof self.ipaddress === "undefined") {
			console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
			self.ipaddress = "0.0.0.0";
		}
	};

	self.populateCache = function () {
		if (typeof self.zcache === "undefined") {
			self.zcache = {
				'response.xml': ''
			};
		}

		self.zcache['response.xml'] = fs.readFileSync('./response.xml');
	};

	self.cache_get = function (key) {
		return self.zcache[key];
	};

	self.terminator = function (sig) {
		if (typeof sig === "string") {
			console.log('%s: Received %s - terminating sample app ...', Date(Date.now()), sig);
			process.exit(1);
		}

		console.log('%s: Node server stopped.', Date(Date.now()));
	};

	self.setupTerminationHandlers = function () {
		//  Process on exit and signals.
		process.on('exit', function () {
			self.terminator();
		});

		['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'].forEach(function (element, index, array) {
			process.on(element, function () {
				self.terminator(element);
			});
		});
	};

	sendXML = function (req, res) {
		res.setHeader('Content-Type', 'application/xml');
		res.send(self.cache_get('response.xml'));
	};

	self.createRoutes = function () {
		self.get_routes = {
			'/': sendXML
		};

		self.post_routes = {
			'/': sendXML
		};
	};

	self.initializeServer = function () {
		var route;

		self.createRoutes();
		self.app = express();

		for (route in self.get_routes) {
			if (self.get_routes.hasOwnProperty(route)) {
				self.app.get(route, self.get_routes[route]);
			}
		}

		for (route in self.post_routes) {
			if (self.post_routes.hasOwnProperty(route)) {
				self.app.post(route, self.post_routes[route]);
			}
		}
	};

	self.initialize = function () {
		self.setupVariables();
		self.populateCache();
		self.setupTerminationHandlers();

		self.initializeServer();
	};


	self.start = function () {
		self.app.listen(self.port, self.ipaddress, function () {
			console.log('%s: Node server started on %s:%d ...', Date(Date.now()), self.ipaddress, self.port);
		});
	};

};

var zapp = new Blackhole();
zapp.initialize();
zapp.start();