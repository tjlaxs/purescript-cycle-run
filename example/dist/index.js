(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
function logToConsoleError(err) {
    var target = err.stack || err;
    if (console && console.error) {
        console.error(target);
    }
    else if (console && console.log) {
        console.log(target);
    }
}
function makeSinkProxies(drivers, streamAdapter) {
    var sinkProxies = {};
    for (var name_1 in drivers) {
        if (drivers.hasOwnProperty(name_1)) {
            var holdSubject = streamAdapter.makeSubject();
            var driverStreamAdapter = drivers[name_1].streamAdapter || streamAdapter;
            var stream = driverStreamAdapter.adapt(holdSubject.stream, streamAdapter.streamSubscribe);
            sinkProxies[name_1] = {
                stream: stream,
                observer: holdSubject.observer,
            };
        }
    }
    return sinkProxies;
}
function callDrivers(drivers, sinkProxies, streamAdapter) {
    var sources = {};
    for (var name_2 in drivers) {
        if (drivers.hasOwnProperty(name_2)) {
            var driverOutput = drivers[name_2](sinkProxies[name_2].stream, streamAdapter, name_2);
            var driverStreamAdapter = drivers[name_2].streamAdapter;
            if (driverStreamAdapter && driverStreamAdapter.isValidStream(driverOutput)) {
                sources[name_2] = streamAdapter.adapt(driverOutput, driverStreamAdapter.streamSubscribe);
            }
            else {
                sources[name_2] = driverOutput;
            }
            if (sources[name_2] && typeof sources[name_2] === 'object') {
                sources[name_2]._isCycleSource = name_2;
            }
        }
    }
    return sources;
}
function replicateMany(sinks, sinkProxies, streamAdapter) {
    var results = Object.keys(sinks)
        .filter(function (name) { return !!sinkProxies[name]; })
        .map(function (name) {
        return streamAdapter.streamSubscribe(sinks[name], {
            next: function (x) { sinkProxies[name].observer.next(x); },
            error: function (err) {
                logToConsoleError(err);
                sinkProxies[name].observer.error(err);
            },
            complete: function (x) {
                sinkProxies[name].observer.complete(x);
            }
        });
    });
    var disposeFunctions = results
        .filter(function (dispose) { return typeof dispose === 'function'; });
    return function () {
        disposeFunctions.forEach(function (dispose) { return dispose(); });
    };
}
function disposeSources(sources) {
    for (var k in sources) {
        if (sources.hasOwnProperty(k) && sources[k]
            && typeof sources[k].dispose === 'function') {
            sources[k].dispose();
        }
    }
}
var isObjectEmpty = function (obj) { return Object.keys(obj).length === 0; };
function Cycle(main, drivers, options) {
    if (typeof main !== "function") {
        throw new Error("First argument given to Cycle must be the 'main' " +
            "function.");
    }
    if (typeof drivers !== "object" || drivers === null) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with driver functions as properties.");
    }
    if (isObjectEmpty(drivers)) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with at least one driver function declared as a property.");
    }
    var streamAdapter = options.streamAdapter;
    if (!streamAdapter || isObjectEmpty(streamAdapter)) {
        throw new Error("Third argument given to Cycle must be an options object " +
            "with the streamAdapter key supplied with a valid stream adapter.");
    }
    var sinkProxies = makeSinkProxies(drivers, streamAdapter);
    var sources = callDrivers(drivers, sinkProxies, streamAdapter);
    var sinks = main(sources);
    if (typeof window !== 'undefined') {
        window.Cyclejs = { sinks: sinks };
    }
    var run = function () {
        var disposeReplication = replicateMany(sinks, sinkProxies, streamAdapter);
        return function () {
            disposeSources(sources);
            disposeReplication();
        };
    };
    return { sinks: sinks, sources: sources, run: run };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{}],2:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var XStreamAdapter = {
    adapt: function (originStream, originStreamSubscribe) {
        if (XStreamAdapter.isValidStream(originStream)) {
            return originStream;
        }
        ;
        var dispose = null;
        return xstream_1.default.create({
            start: function (out) {
                var observer = out;
                dispose = originStreamSubscribe(originStream, observer);
            },
            stop: function () {
                if (typeof dispose === 'function') {
                    dispose();
                }
            }
        });
    },
    makeSubject: function () {
        var stream = xstream_1.default.create();
        var observer = {
            next: function (x) { stream.shamefullySendNext(x); },
            error: function (err) { stream.shamefullySendError(err); },
            complete: function () { stream.shamefullySendComplete(); }
        };
        return { observer: observer, stream: stream };
    },
    remember: function (stream) {
        return stream.remember();
    },
    isValidStream: function (stream) {
        return (typeof stream.addListener === 'function' &&
            typeof stream.shamefullySendNext === 'function');
    },
    streamSubscribe: function (stream, observer) {
        stream.addListener(observer);
        return function () { return stream.removeListener(observer); };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = XStreamAdapter;

},{"xstream":11}],3:[function(require,module,exports){
"use strict";
var base_1 = require('@cycle/base');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import {run} from '@cycle/xstream-run';
 * const dispose = run(main, drivers);
 * // ...
 * dispose();
 * ```
 *
 * The `main` function expects a collection of "source" streams (returned from
 * drivers) as input, and should return a collection of "sink" streams (to be
 * given to drivers). A "collection of streams" is a JavaScript object where
 * keys match the driver names registered by the `drivers` object, and values
 * are the streams. Refer to the documentation of each driver to see more
 * details on what types of sources it outputs and sinks it receives.
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Function} a dispose function, used to terminate the execution of the
 * Cycle.js program, cleaning up resources used.
 * @function run
 */
function run(main, drivers) {
    var _a = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default }), run = _a.run, sinks = _a.sinks;
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](sinks);
    }
    return run();
}
exports.run = run;
/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `Cycle()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import Cycle from '@cycle/xstream-run';
 * const {sources, sinks, run} = Cycle(main, drivers);
 * // ...
 * const dispose = run(); // Executes the application
 * // ...
 * dispose();
 * ```
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Object} an object with three properties: `sources`, `sinks` and
 * `run`. `sources` is the collection of driver sources, `sinks` is the
 * collection of driver sinks, these can be used for debugging or testing. `run`
 * is the function that once called will execute the application.
 * @function Cycle
 */
var Cycle = function (main, drivers) {
    var out = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default });
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](out.sinks);
    }
    return out;
};
Cycle.run = run;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{"@cycle/base":1,"@cycle/xstream-adapter":2}],4:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":5}],5:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _ponyfill = require('./ponyfill');

var _ponyfill2 = _interopRequireDefault(_ponyfill);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var root; /* global window */


if (typeof self !== 'undefined') {
  root = self;
} else if (typeof window !== 'undefined') {
  root = window;
} else if (typeof global !== 'undefined') {
  root = global;
} else if (typeof module !== 'undefined') {
  root = module;
} else {
  root = Function('return this')();
}

var result = (0, _ponyfill2['default'])(root);
exports['default'] = result;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./ponyfill":6}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports['default'] = symbolObservablePonyfill;
function symbolObservablePonyfill(root) {
	var result;
	var _Symbol = root.Symbol;

	if (typeof _Symbol === 'function') {
		if (_Symbol.observable) {
			result = _Symbol.observable;
		} else {
			result = _Symbol('observable');
			_Symbol.observable = result;
		}
	} else {
		result = '@@observable';
	}

	return result;
};
},{}],7:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var symbol_observable_1 = require('symbol-observable');
var NO = {};
function noop() { }
function copy(a) {
    var l = a.length;
    var b = Array(l);
    for (var i = 0; i < l; ++i) {
        b[i] = a[i];
    }
    return b;
}
exports.NO_IL = {
    _n: noop,
    _e: noop,
    _c: noop,
};
// mutates the input
function internalizeProducer(producer) {
    producer._start =
        function _start(il) {
            il.next = il._n;
            il.error = il._e;
            il.complete = il._c;
            this.start(il);
        };
    producer._stop = producer.stop;
}
function and(f1, f2) {
    return function andFn(t) {
        return f1(t) && f2(t);
    };
}
var Subscription = (function () {
    function Subscription(_stream, _listener) {
        this._stream = _stream;
        this._listener = _listener;
    }
    Subscription.prototype.unsubscribe = function () {
        this._stream.removeListener(this._listener);
    };
    return Subscription;
}());
exports.Subscription = Subscription;
var ObservableProducer = (function () {
    function ObservableProducer(observable) {
        this.type = 'fromObservable';
        this.ins = observable;
    }
    ObservableProducer.prototype._start = function (out) {
        this.out = out;
        this._subscription = this.ins.subscribe(new ObservableListener(out));
    };
    ObservableProducer.prototype._stop = function () {
        this._subscription.unsubscribe();
    };
    return ObservableProducer;
}());
var ObservableListener = (function () {
    function ObservableListener(_listener) {
        this._listener = _listener;
    }
    ObservableListener.prototype.next = function (value) {
        this._listener._n(value);
    };
    ObservableListener.prototype.error = function (err) {
        this._listener._e(err);
    };
    ObservableListener.prototype.complete = function () {
        this._listener._c();
    };
    return ObservableListener;
}());
var MergeProducer = (function () {
    function MergeProducer(insArr) {
        this.type = 'merge';
        this.insArr = insArr;
        this.out = NO;
        this.ac = 0;
    }
    MergeProducer.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var L = s.length;
        this.ac = L;
        for (var i = 0; i < L; i++) {
            s[i]._add(this);
        }
    };
    MergeProducer.prototype._stop = function () {
        var s = this.insArr;
        var L = s.length;
        for (var i = 0; i < L; i++) {
            s[i]._remove(this);
        }
        this.out = NO;
    };
    MergeProducer.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    MergeProducer.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MergeProducer.prototype._c = function () {
        if (--this.ac <= 0) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    return MergeProducer;
}());
exports.MergeProducer = MergeProducer;
var CombineListener = (function () {
    function CombineListener(i, out, p) {
        this.i = i;
        this.out = out;
        this.p = p;
        p.ils.push(this);
    }
    CombineListener.prototype._n = function (t) {
        var p = this.p, out = this.out;
        if (out === NO)
            return;
        if (p.up(t, this.i)) {
            out._n(p.vals);
        }
    };
    CombineListener.prototype._e = function (err) {
        var out = this.out;
        if (out === NO)
            return;
        out._e(err);
    };
    CombineListener.prototype._c = function () {
        var p = this.p;
        if (p.out === NO)
            return;
        if (--p.Nc === 0) {
            p.out._c();
        }
    };
    return CombineListener;
}());
exports.CombineListener = CombineListener;
var CombineProducer = (function () {
    function CombineProducer(insArr) {
        this.type = 'combine';
        this.insArr = insArr;
        this.out = NO;
        this.ils = [];
        this.Nc = this.Nn = 0;
        this.vals = [];
    }
    CombineProducer.prototype.up = function (t, i) {
        var v = this.vals[i];
        var Nn = !this.Nn ? 0 : v === NO ? --this.Nn : this.Nn;
        this.vals[i] = t;
        return Nn === 0;
    };
    CombineProducer.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var n = this.Nc = this.Nn = s.length;
        var vals = this.vals = new Array(n);
        if (n === 0) {
            out._n([]);
            out._c();
        }
        else {
            for (var i = 0; i < n; i++) {
                vals[i] = NO;
                s[i]._add(new CombineListener(i, out, this));
            }
        }
    };
    CombineProducer.prototype._stop = function () {
        var s = this.insArr;
        var n = s.length;
        var ils = this.ils;
        for (var i = 0; i < n; i++) {
            s[i]._remove(ils[i]);
        }
        this.out = NO;
        this.ils = [];
        this.vals = [];
    };
    return CombineProducer;
}());
exports.CombineProducer = CombineProducer;
var FromArrayProducer = (function () {
    function FromArrayProducer(a) {
        this.type = 'fromArray';
        this.a = a;
    }
    FromArrayProducer.prototype._start = function (out) {
        var a = this.a;
        for (var i = 0, l = a.length; i < l; i++) {
            out._n(a[i]);
        }
        out._c();
    };
    FromArrayProducer.prototype._stop = function () {
    };
    return FromArrayProducer;
}());
exports.FromArrayProducer = FromArrayProducer;
var FromPromiseProducer = (function () {
    function FromPromiseProducer(p) {
        this.type = 'fromPromise';
        this.on = false;
        this.p = p;
    }
    FromPromiseProducer.prototype._start = function (out) {
        var prod = this;
        this.on = true;
        this.p.then(function (v) {
            if (prod.on) {
                out._n(v);
                out._c();
            }
        }, function (e) {
            out._e(e);
        }).then(noop, function (err) {
            setTimeout(function () { throw err; });
        });
    };
    FromPromiseProducer.prototype._stop = function () {
        this.on = false;
    };
    return FromPromiseProducer;
}());
exports.FromPromiseProducer = FromPromiseProducer;
var PeriodicProducer = (function () {
    function PeriodicProducer(period) {
        this.type = 'periodic';
        this.period = period;
        this.intervalID = -1;
        this.i = 0;
    }
    PeriodicProducer.prototype._start = function (stream) {
        var self = this;
        function intervalHandler() { stream._n(self.i++); }
        this.intervalID = setInterval(intervalHandler, this.period);
    };
    PeriodicProducer.prototype._stop = function () {
        if (this.intervalID !== -1)
            clearInterval(this.intervalID);
        this.intervalID = -1;
        this.i = 0;
    };
    return PeriodicProducer;
}());
exports.PeriodicProducer = PeriodicProducer;
var DebugOperator = (function () {
    function DebugOperator(ins, arg) {
        this.type = 'debug';
        this.ins = ins;
        this.out = NO;
        this.s = noop;
        this.l = '';
        if (typeof arg === 'string') {
            this.l = arg;
        }
        else if (typeof arg === 'function') {
            this.s = arg;
        }
    }
    DebugOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DebugOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    DebugOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var s = this.s, l = this.l;
        if (s !== noop) {
            try {
                s(t);
            }
            catch (e) {
                u._e(e);
            }
        }
        else if (l) {
            console.log(l + ':', t);
        }
        else {
            console.log(t);
        }
        u._n(t);
    };
    DebugOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    DebugOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return DebugOperator;
}());
exports.DebugOperator = DebugOperator;
var DropOperator = (function () {
    function DropOperator(max, ins) {
        this.type = 'drop';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.dropped = 0;
    }
    DropOperator.prototype._start = function (out) {
        this.out = out;
        this.dropped = 0;
        this.ins._add(this);
    };
    DropOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    DropOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.dropped++ >= this.max)
            u._n(t);
    };
    DropOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    DropOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return DropOperator;
}());
exports.DropOperator = DropOperator;
var OtherIL = (function () {
    function OtherIL(out, op) {
        this.out = out;
        this.op = op;
    }
    OtherIL.prototype._n = function (t) {
        this.op.end();
    };
    OtherIL.prototype._e = function (err) {
        this.out._e(err);
    };
    OtherIL.prototype._c = function () {
        this.op.end();
    };
    return OtherIL;
}());
var EndWhenOperator = (function () {
    function EndWhenOperator(o, ins) {
        this.type = 'endWhen';
        this.ins = ins;
        this.out = NO;
        this.o = o;
        this.oil = exports.NO_IL;
    }
    EndWhenOperator.prototype._start = function (out) {
        this.out = out;
        this.o._add(this.oil = new OtherIL(out, this));
        this.ins._add(this);
    };
    EndWhenOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.o._remove(this.oil);
        this.out = NO;
        this.oil = exports.NO_IL;
    };
    EndWhenOperator.prototype.end = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    EndWhenOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    EndWhenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    EndWhenOperator.prototype._c = function () {
        this.end();
    };
    return EndWhenOperator;
}());
exports.EndWhenOperator = EndWhenOperator;
var FilterOperator = (function () {
    function FilterOperator(passes, ins) {
        this.type = 'filter';
        this.ins = ins;
        this.out = NO;
        this.passes = passes;
    }
    FilterOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    FilterOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    FilterOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            if (this.passes(t))
                u._n(t);
        }
        catch (e) {
            u._e(e);
        }
    };
    FilterOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FilterOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return FilterOperator;
}());
exports.FilterOperator = FilterOperator;
var FlattenListener = (function () {
    function FlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    FlattenListener.prototype._n = function (t) {
        this.out._n(t);
    };
    FlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    FlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return FlattenListener;
}());
var FlattenOperator = (function () {
    function FlattenOperator(ins) {
        this.type = 'flatten';
        this.ins = ins;
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
    }
    FlattenOperator.prototype._start = function (out) {
        this.out = out;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.ins._add(this);
    };
    FlattenOperator.prototype._stop = function () {
        this.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
    };
    FlattenOperator.prototype.less = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (!this.open && this.inner === NO)
            u._c();
    };
    FlattenOperator.prototype._n = function (s) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        if (inner !== NO && il !== exports.NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new FlattenListener(u, this));
    };
    FlattenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FlattenOperator.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return FlattenOperator;
}());
exports.FlattenOperator = FlattenOperator;
var FoldOperator = (function () {
    function FoldOperator(f, seed, ins) {
        this.type = 'fold';
        this.ins = ins;
        this.out = NO;
        this.f = f;
        this.acc = this.seed = seed;
    }
    FoldOperator.prototype._start = function (out) {
        this.out = out;
        this.acc = this.seed;
        out._n(this.acc);
        this.ins._add(this);
    };
    FoldOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.acc = this.seed;
    };
    FoldOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            u._n(this.acc = this.f(this.acc, t));
        }
        catch (e) {
            u._e(e);
        }
    };
    FoldOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FoldOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return FoldOperator;
}());
exports.FoldOperator = FoldOperator;
var LastOperator = (function () {
    function LastOperator(ins) {
        this.type = 'last';
        this.ins = ins;
        this.out = NO;
        this.has = false;
        this.val = NO;
    }
    LastOperator.prototype._start = function (out) {
        this.out = out;
        this.has = false;
        this.ins._add(this);
    };
    LastOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.val = NO;
    };
    LastOperator.prototype._n = function (t) {
        this.has = true;
        this.val = t;
    };
    LastOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    LastOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (this.has) {
            u._n(this.val);
            u._c();
        }
        else {
            u._e('TODO show proper error');
        }
    };
    return LastOperator;
}());
exports.LastOperator = LastOperator;
var MapFlattenInner = (function () {
    function MapFlattenInner(out, op) {
        this.out = out;
        this.op = op;
    }
    MapFlattenInner.prototype._n = function (r) {
        this.out._n(r);
    };
    MapFlattenInner.prototype._e = function (err) {
        this.out._e(err);
    };
    MapFlattenInner.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return MapFlattenInner;
}());
var MapFlattenOperator = (function () {
    function MapFlattenOperator(mapOp) {
        this.type = mapOp.type + "+flatten";
        this.ins = mapOp.ins;
        this.out = NO;
        this.mapOp = mapOp;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.open = true;
    }
    MapFlattenOperator.prototype._start = function (out) {
        this.out = out;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.open = true;
        this.mapOp.ins._add(this);
    };
    MapFlattenOperator.prototype._stop = function () {
        this.mapOp.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.inner = NO;
        this.il = exports.NO_IL;
    };
    MapFlattenOperator.prototype.less = function () {
        if (!this.open && this.inner === NO) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    MapFlattenOperator.prototype._n = function (v) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        var s;
        try {
            s = this.mapOp.project(v);
        }
        catch (e) {
            u._e(e);
            return;
        }
        if (inner !== NO && il !== exports.NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new MapFlattenInner(u, this));
    };
    MapFlattenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapFlattenOperator.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return MapFlattenOperator;
}());
exports.MapFlattenOperator = MapFlattenOperator;
var MapOperator = (function () {
    function MapOperator(project, ins) {
        this.type = 'map';
        this.ins = ins;
        this.out = NO;
        this.project = project;
    }
    MapOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    MapOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    MapOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            u._n(this.project(t));
        }
        catch (e) {
            u._e(e);
        }
    };
    MapOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return MapOperator;
}());
exports.MapOperator = MapOperator;
var FilterMapOperator = (function (_super) {
    __extends(FilterMapOperator, _super);
    function FilterMapOperator(passes, project, ins) {
        _super.call(this, project, ins);
        this.type = 'filter+map';
        this.passes = passes;
    }
    FilterMapOperator.prototype._n = function (t) {
        if (!this.passes(t))
            return;
        var u = this.out;
        if (u === NO)
            return;
        try {
            u._n(this.project(t));
        }
        catch (e) {
            u._e(e);
        }
    };
    return FilterMapOperator;
}(MapOperator));
exports.FilterMapOperator = FilterMapOperator;
var RememberOperator = (function () {
    function RememberOperator(ins) {
        this.type = 'remember';
        this.ins = ins;
        this.out = NO;
    }
    RememberOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(out);
    };
    RememberOperator.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return RememberOperator;
}());
exports.RememberOperator = RememberOperator;
var ReplaceErrorOperator = (function () {
    function ReplaceErrorOperator(fn, ins) {
        this.type = 'replaceError';
        this.ins = ins;
        this.out = NO;
        this.fn = fn;
    }
    ReplaceErrorOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    ReplaceErrorOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    ReplaceErrorOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    ReplaceErrorOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            this.ins._remove(this);
            (this.ins = this.fn(err))._add(this);
        }
        catch (e) {
            u._e(e);
        }
    };
    ReplaceErrorOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return ReplaceErrorOperator;
}());
exports.ReplaceErrorOperator = ReplaceErrorOperator;
var StartWithOperator = (function () {
    function StartWithOperator(ins, val) {
        this.type = 'startWith';
        this.ins = ins;
        this.out = NO;
        this.val = val;
    }
    StartWithOperator.prototype._start = function (out) {
        this.out = out;
        this.out._n(this.val);
        this.ins._add(out);
    };
    StartWithOperator.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return StartWithOperator;
}());
exports.StartWithOperator = StartWithOperator;
var TakeOperator = (function () {
    function TakeOperator(max, ins) {
        this.type = 'take';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.taken = 0;
    }
    TakeOperator.prototype._start = function (out) {
        this.out = out;
        this.taken = 0;
        if (this.max <= 0) {
            out._c();
        }
        else {
            this.ins._add(this);
        }
    };
    TakeOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    TakeOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.taken++ < this.max - 1) {
            u._n(t);
        }
        else {
            u._n(t);
            u._c();
        }
    };
    TakeOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    TakeOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return TakeOperator;
}());
exports.TakeOperator = TakeOperator;
var Stream = (function () {
    function Stream(producer) {
        this._prod = producer || NO;
        this._ils = [];
        this._stopID = NO;
        this._dl = NO;
        this._d = false;
        this._target = NO;
        this._err = NO;
    }
    Stream.prototype._n = function (t) {
        var a = this._ils;
        var L = a.length;
        if (this._d)
            this._dl._n(t);
        if (L == 1)
            a[0]._n(t);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._n(t);
        }
    };
    Stream.prototype._e = function (err) {
        if (this._err !== NO)
            return;
        this._err = err;
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._e(err);
        if (L == 1)
            a[0]._e(err);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._e(err);
        }
    };
    Stream.prototype._c = function () {
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._c();
        if (L == 1)
            a[0]._c();
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._c();
        }
    };
    Stream.prototype._x = function () {
        if (this._ils.length === 0)
            return;
        if (this._prod !== NO)
            this._prod._stop();
        this._err = NO;
        this._ils = [];
    };
    Stream.prototype._stopNow = function () {
        // WARNING: code that calls this method should
        // first check if this._prod is valid (not `NO`)
        this._prod._stop();
        this._err = NO;
        this._stopID = NO;
    };
    Stream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1)
            return;
        if (this._stopID !== NO) {
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    Stream.prototype._remove = function (il) {
        var _this = this;
        var ta = this._target;
        if (ta !== NO)
            return ta._remove(il);
        var a = this._ils;
        var i = a.indexOf(il);
        if (i > -1) {
            a.splice(i, 1);
            if (this._prod !== NO && a.length <= 0) {
                this._err = NO;
                this._stopID = setTimeout(function () { return _this._stopNow(); });
            }
            else if (a.length === 1) {
                this._pruneCycles();
            }
        }
    };
    // If all paths stemming from `this` stream eventually end at `this`
    // stream, then we remove the single listener of `this` stream, to
    // force it to end its execution and dispose resources. This method
    // assumes as a precondition that this._ils has just one listener.
    Stream.prototype._pruneCycles = function () {
        if (this._hasNoSinks(this, [])) {
            this._remove(this._ils[0]);
        }
    };
    // Checks whether *there is no* path starting from `x` that leads to an end
    // listener (sink) in the stream graph, following edges A->B where B is a
    // listener of A. This means these paths constitute a cycle somehow. Is given
    // a trace of all visited nodes so far.
    Stream.prototype._hasNoSinks = function (x, trace) {
        if (trace.indexOf(x) !== -1) {
            return true;
        }
        else if (x.out === this) {
            return true;
        }
        else if (x.out && x.out !== NO) {
            return this._hasNoSinks(x.out, trace.concat(x));
        }
        else if (x._ils) {
            for (var i = 0, N = x._ils.length; i < N; i++) {
                if (!this._hasNoSinks(x._ils[i], trace.concat(x))) {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    };
    Stream.prototype.ctor = function () {
        return this instanceof MemoryStream ? MemoryStream : Stream;
    };
    /**
     * Adds a Listener to the Stream.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.addListener = function (listener) {
        listener._n = listener.next || noop;
        listener._e = listener.error || noop;
        listener._c = listener.complete || noop;
        this._add(listener);
    };
    /**
     * Removes a Listener from the Stream, assuming the Listener was added to it.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.removeListener = function (listener) {
        this._remove(listener);
    };
    /**
     * Adds a Listener to the Stream returning a Subscription to remove that
     * listener.
     *
     * @param {Listener} listener
     * @returns {Subscription}
     */
    Stream.prototype.subscribe = function (listener) {
        this.addListener(listener);
        return new Subscription(this, listener);
    };
    /**
     * Add interop between most.js and RxJS 5
     *
     * @returns {Stream}
     */
    Stream.prototype[symbol_observable_1.default] = function () {
        return this;
    };
    /**
     * Creates a new Stream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {Stream}
     */
    Stream.create = function (producer) {
        if (producer) {
            if (typeof producer.start !== 'function'
                || typeof producer.stop !== 'function') {
                throw new Error('producer requires both start and stop functions');
            }
            internalizeProducer(producer); // mutates the input
        }
        return new Stream(producer);
    };
    /**
     * Creates a new MemoryStream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {MemoryStream}
     */
    Stream.createWithMemory = function (producer) {
        if (producer) {
            internalizeProducer(producer); // mutates the input
        }
        return new MemoryStream(producer);
    };
    /**
     * Creates a Stream that does nothing when started. It never emits any event.
     *
     * Marble diagram:
     *
     * ```text
     *          never
     * -----------------------
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.never = function () {
        return new Stream({ _start: noop, _stop: noop });
    };
    /**
     * Creates a Stream that immediately emits the "complete" notification when
     * started, and that's it.
     *
     * Marble diagram:
     *
     * ```text
     * empty
     * -|
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.empty = function () {
        return new Stream({
            _start: function (il) { il._c(); },
            _stop: noop,
        });
    };
    /**
     * Creates a Stream that immediately emits an "error" notification with the
     * value you passed as the `error` argument when the stream starts, and that's
     * it.
     *
     * Marble diagram:
     *
     * ```text
     * throw(X)
     * -X
     * ```
     *
     * @factory true
     * @param error The error event to emit on the created stream.
     * @return {Stream}
     */
    Stream.throw = function (error) {
        return new Stream({
            _start: function (il) { il._e(error); },
            _stop: noop,
        });
    };
    /**
     * Creates a stream from an Array, Promise, or an Observable.
     *
     * @factory true
     * @param {Array|Promise|Observable} input The input to make a stream from.
     * @return {Stream}
     */
    Stream.from = function (input) {
        if (typeof input[symbol_observable_1.default] === 'function') {
            return Stream.fromObservable(input);
        }
        else if (typeof input.then === 'function') {
            return Stream.fromPromise(input);
        }
        else if (Array.isArray(input)) {
            return Stream.fromArray(input);
        }
        throw new TypeError("Type of input to from() must be an Array, Promise, or Observable");
    };
    /**
     * Creates a Stream that immediately emits the arguments that you give to
     * *of*, then completes.
     *
     * Marble diagram:
     *
     * ```text
     * of(1,2,3)
     * 123|
     * ```
     *
     * @factory true
     * @param a The first value you want to emit as an event on the stream.
     * @param b The second value you want to emit as an event on the stream. One
     * or more of these values may be given as arguments.
     * @return {Stream}
     */
    Stream.of = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i - 0] = arguments[_i];
        }
        return Stream.fromArray(items);
    };
    /**
     * Converts an array to a stream. The returned stream will emit synchronously
     * all the items in the array, and then complete.
     *
     * Marble diagram:
     *
     * ```text
     * fromArray([1,2,3])
     * 123|
     * ```
     *
     * @factory true
     * @param {Array} array The array to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromArray = function (array) {
        return new Stream(new FromArrayProducer(array));
    };
    /**
     * Converts a promise to a stream. The returned stream will emit the resolved
     * value of the promise, and then complete. However, if the promise is
     * rejected, the stream will emit the corresponding error.
     *
     * Marble diagram:
     *
     * ```text
     * fromPromise( ----42 )
     * -----------------42|
     * ```
     *
     * @factory true
     * @param {Promise} promise The promise to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromPromise = function (promise) {
        return new Stream(new FromPromiseProducer(promise));
    };
    /**
     * Converts an Observable into a Stream.
     *
     * @factory true
     * @param {any} observable The observable to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromObservable = function (observable) {
        return new Stream(new ObservableProducer(observable));
    };
    /**
     * Creates a stream that periodically emits incremental numbers, every
     * `period` milliseconds.
     *
     * Marble diagram:
     *
     * ```text
     *     periodic(1000)
     * ---0---1---2---3---4---...
     * ```
     *
     * @factory true
     * @param {number} period The interval in milliseconds to use as a rate of
     * emission.
     * @return {Stream}
     */
    Stream.periodic = function (period) {
        return new Stream(new PeriodicProducer(period));
    };
    Stream.prototype._map = function (project) {
        var p = this._prod;
        var ctor = this.ctor();
        if (p instanceof FilterOperator) {
            return new ctor(new FilterMapOperator(p.passes, project, p.ins));
        }
        return new ctor(new MapOperator(project, this));
    };
    /**
     * Transforms each event from the input Stream through a `project` function,
     * to get a Stream that emits those transformed events.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7------
     *    map(i => i * 10)
     * --10--30-50----70-----
     * ```
     *
     * @param {Function} project A function of type `(t: T) => U` that takes event
     * `t` of type `T` from the input Stream and produces an event of type `U`, to
     * be emitted on the output Stream.
     * @return {Stream}
     */
    Stream.prototype.map = function (project) {
        return this._map(project);
    };
    /**
     * It's like `map`, but transforms each input event to always the same
     * constant value on the output Stream.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7-----
     *       mapTo(10)
     * --10--10-10----10----
     * ```
     *
     * @param projectedValue A value to emit on the output Stream whenever the
     * input Stream emits any value.
     * @return {Stream}
     */
    Stream.prototype.mapTo = function (projectedValue) {
        var s = this.map(function () { return projectedValue; });
        var op = s._prod;
        op.type = op.type.replace('map', 'mapTo');
        return s;
    };
    /**
     * Only allows events that pass the test given by the `passes` argument.
     *
     * Each event from the input stream is given to the `passes` function. If the
     * function returns `true`, the event is forwarded to the output stream,
     * otherwise it is ignored and not forwarded.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2--3-----4-----5---6--7-8--
     *     filter(i => i % 2 === 0)
     * ------2--------4---------6----8--
     * ```
     *
     * @param {Function} passes A function of type `(t: T) +> boolean` that takes
     * an event from the input stream and checks if it passes, by returning a
     * boolean.
     * @return {Stream}
     */
    Stream.prototype.filter = function (passes) {
        var p = this._prod;
        if (p instanceof FilterOperator) {
            return new Stream(new FilterOperator(and(p.passes, passes), p.ins));
        }
        return new Stream(new FilterOperator(passes, this));
    };
    /**
     * Lets the first `amount` many events from the input stream pass to the
     * output stream, then makes the output stream complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *    take(3)
     * --a---b--c|
     * ```
     *
     * @param {number} amount How many events to allow from the input stream
     * before completing the output stream.
     * @return {Stream}
     */
    Stream.prototype.take = function (amount) {
        return new (this.ctor())(new TakeOperator(amount, this));
    };
    /**
     * Ignores the first `amount` many events from the input stream, and then
     * after that starts forwarding events from the input stream to the output
     * stream.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *       drop(3)
     * --------------d---e--
     * ```
     *
     * @param {number} amount How many events to ignore from the input stream
     * before forwarding all events from the input stream to the output stream.
     * @return {Stream}
     */
    Stream.prototype.drop = function (amount) {
        return new Stream(new DropOperator(amount, this));
    };
    /**
     * When the input stream completes, the output stream will emit the last event
     * emitted by the input stream, and then will also complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c--d----|
     *       last()
     * -----------------d|
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.last = function () {
        return new Stream(new LastOperator(this));
    };
    /**
     * Prepends the given `initial` value to the sequence of events emitted by the
     * input stream. The returned stream is a MemoryStream, which means it is
     * already `remember()`'d.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3---
     *   startWith(0)
     * 0--1---2-----3---
     * ```
     *
     * @param initial The value or event to prepend.
     * @return {MemoryStream}
     */
    Stream.prototype.startWith = function (initial) {
        return new MemoryStream(new StartWithOperator(this, initial));
    };
    /**
     * Uses another stream to determine when to complete the current stream.
     *
     * When the given `other` stream emits an event or completes, the output
     * stream will complete. Before that happens, the output stream will behaves
     * like the input stream.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3--4----5----6---
     *   endWhen( --------a--b--| )
     * ---1---2-----3--4--|
     * ```
     *
     * @param other Some other stream that is used to know when should the output
     * stream of this operator complete.
     * @return {Stream}
     */
    Stream.prototype.endWhen = function (other) {
        return new (this.ctor())(new EndWhenOperator(other, this));
    };
    /**
     * "Folds" the stream onto itself.
     *
     * Combines events from the past throughout
     * the entire execution of the input stream, allowing you to accumulate them
     * together. It's essentially like `Array.prototype.reduce`. The returned
     * stream is a MemoryStream, which means it is already `remember()`'d.
     *
     * The output stream starts by emitting the `seed` which you give as argument.
     * Then, when an event happens on the input stream, it is combined with that
     * seed value through the `accumulate` function, and the output value is
     * emitted on the output stream. `fold` remembers that output value as `acc`
     * ("accumulator"), and then when a new input event `t` happens, `acc` will be
     * combined with that to produce the new `acc` and so forth.
     *
     * Marble diagram:
     *
     * ```text
     * ------1-----1--2----1----1------
     *   fold((acc, x) => acc + x, 3)
     * 3-----4-----5--7----8----9------
     * ```
     *
     * @param {Function} accumulate A function of type `(acc: R, t: T) => R` that
     * takes the previous accumulated value `acc` and the incoming event from the
     * input stream and produces the new accumulated value.
     * @param seed The initial accumulated value, of type `R`.
     * @return {MemoryStream}
     */
    Stream.prototype.fold = function (accumulate, seed) {
        return new MemoryStream(new FoldOperator(accumulate, seed, this));
    };
    /**
     * Replaces an error with another stream.
     *
     * When (and if) an error happens on the input stream, instead of forwarding
     * that error to the output stream, *replaceError* will call the `replace`
     * function which returns the stream that the output stream will replicate.
     * And, in case that new stream also emits an error, `replace` will be called
     * again to get another stream to start replicating.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2-----3--4-----X
     *   replaceError( () => --10--| )
     * --1---2-----3--4--------10--|
     * ```
     *
     * @param {Function} replace A function of type `(err) => Stream` that takes
     * the error that occurred on the input stream or on the previous replacement
     * stream and returns a new stream. The output stream will behave like the
     * stream that this function returns.
     * @return {Stream}
     */
    Stream.prototype.replaceError = function (replace) {
        return new (this.ctor())(new ReplaceErrorOperator(replace, this));
    };
    /**
     * Flattens a "stream of streams", handling only one nested stream at a time
     * (no concurrency).
     *
     * If the input stream is a stream that emits streams, then this operator will
     * return an output stream which is a flat stream: emits regular events. The
     * flattening happens without concurrency. It works like this: when the input
     * stream emits a nested stream, *flatten* will start imitating that nested
     * one. However, as soon as the next nested stream is emitted on the input
     * stream, *flatten* will forget the previous nested one it was imitating, and
     * will start imitating the new nested one.
     *
     * Marble diagram:
     *
     * ```text
     * --+--------+---------------
     *   \        \
     *    \       ----1----2---3--
     *    --a--b----c----d--------
     *           flatten
     * -----a--b------1----2---3--
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.flatten = function () {
        var p = this._prod;
        return new Stream(p instanceof MapOperator && !(p instanceof FilterMapOperator) ?
            new MapFlattenOperator(p) :
            new FlattenOperator(this));
    };
    /**
     * Passes the input stream to a custom operator, to produce an output stream.
     *
     * *compose* is a handy way of using an existing function in a chained style.
     * Instead of writing `outStream = f(inStream)` you can write
     * `outStream = inStream.compose(f)`.
     *
     * @param {function} operator A function that takes a stream as input and
     * returns a stream as well.
     * @return {Stream}
     */
    Stream.prototype.compose = function (operator) {
        return operator(this);
    };
    /**
     * Returns an output stream that behaves like the input stream, but also
     * remembers the most recent event that happens on the input stream, so that a
     * newly added listener will immediately receive that memorised event.
     *
     * @return {MemoryStream}
     */
    Stream.prototype.remember = function () {
        return new MemoryStream(new RememberOperator(this));
    };
    /**
     * Returns an output stream that identically behaves like the input stream,
     * but also runs a `spy` function fo each event, to help you debug your app.
     *
     * *debug* takes a `spy` function as argument, and runs that for each event
     * happening on the input stream. If you don't provide the `spy` argument,
     * then *debug* will just `console.log` each event. This helps you to
     * understand the flow of events through some operator chain.
     *
     * Please note that if the output stream has no listeners, then it will not
     * start, which means `spy` will never run because no actual event happens in
     * that case.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3-----4--
     *         debug
     * --1----2-----3-----4--
     * ```
     *
     * @param {function} labelOrSpy A string to use as the label when printing
     * debug information on the console, or a 'spy' function that takes an event
     * as argument, and does not need to return anything.
     * @return {Stream}
     */
    Stream.prototype.debug = function (labelOrSpy) {
        return new (this.ctor())(new DebugOperator(this, labelOrSpy));
    };
    /**
     * *imitate* changes this current Stream to emit the same events that the
     * `other` given Stream does. This method returns nothing.
     *
     * This method exists to allow one thing: **circular dependency of streams**.
     * For instance, let's imagine that for some reason you need to create a
     * circular dependency where stream `first$` depends on stream `second$`
     * which in turn depends on `first$`:
     *
     * <!-- skip-example -->
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var first$ = second$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * ```
     *
     * However, that is invalid JavaScript, because `second$` is undefined
     * on the first line. This is how *imitate* can help solve it:
     *
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var secondProxy$ = xs.create();
     * var first$ = secondProxy$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * secondProxy$.imitate(second$);
     * ```
     *
     * We create `secondProxy$` before the others, so it can be used in the
     * declaration of `first$`. Then, after both `first$` and `second$` are
     * defined, we hook `secondProxy$` with `second$` with `imitate()` to tell
     * that they are "the same". `imitate` will not trigger the start of any
     * stream, it just binds `secondProxy$` and `second$` together.
     *
     * The following is an example where `imitate()` is important in Cycle.js
     * applications. A parent component contains some child components. A child
     * has an action stream which is given to the parent to define its state:
     *
     * <!-- skip-example -->
     * ```js
     * const childActionProxy$ = xs.create();
     * const parent = Parent({...sources, childAction$: childActionProxy$});
     * const childAction$ = parent.state$.map(s => s.child.action$).flatten();
     * childActionProxy$.imitate(childAction$);
     * ```
     *
     * Note, though, that **`imitate()` does not support MemoryStreams**. If we
     * would attempt to imitate a MemoryStream in a circular dependency, we would
     * either get a race condition (where the symptom would be "nothing happens")
     * or an infinite cyclic emission of values. It's useful to think about
     * MemoryStreams as cells in a spreadsheet. It doesn't make any sense to
     * define a spreadsheet cell `A1` with a formula that depends on `B1` and
     * cell `B1` defined with a formula that depends on `A1`.
     *
     * If you find yourself wanting to use `imitate()` with a
     * MemoryStream, you should rework your code around `imitate()` to use a
     * Stream instead. Look for the stream in the circular dependency that
     * represents an event stream, and that would be a candidate for creating a
     * proxy Stream which then imitates the target Stream.
     *
     * @param {Stream} target The other stream to imitate on the current one. Must
     * not be a MemoryStream.
     */
    Stream.prototype.imitate = function (target) {
        if (target instanceof MemoryStream) {
            throw new Error('A MemoryStream was given to imitate(), but it only ' +
                'supports a Stream. Read more about this restriction here: ' +
                'https://github.com/staltz/xstream#faq');
        }
        this._target = target;
        for (var ils = this._ils, N = ils.length, i = 0; i < N; i++) {
            target._add(ils[i]);
        }
        this._ils = [];
    };
    /**
     * Forces the Stream to emit the given value to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param value The "next" value you want to broadcast to all listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendNext = function (value) {
        this._n(value);
    };
    /**
     * Forces the Stream to emit the given error to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param {any} error The error you want to broadcast to all the listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendError = function (error) {
        this._e(error);
    };
    /**
     * Forces the Stream to emit the "completed" event to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     */
    Stream.prototype.shamefullySendComplete = function () {
        this._c();
    };
    /**
     * Adds a "debug" listener to the stream. There can only be one debug
     * listener, that's why this is 'setDebugListener'. To remove the debug
     * listener, just call setDebugListener(null).
     *
     * A debug listener is like any other listener. The only difference is that a
     * debug listener is "stealthy": its presence/absence does not trigger the
     * start/stop of the stream (or the producer inside the stream). This is
     * useful so you can inspect what is going on without changing the behavior
     * of the program. If you have an idle stream and you add a normal listener to
     * it, the stream will start executing. But if you set a debug listener on an
     * idle stream, it won't start executing (not until the first normal listener
     * is added).
     *
     * As the name indicates, we don't recommend using this method to build app
     * logic. In fact, in most cases the debug operator works just fine. Only use
     * this one if you know what you're doing.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.setDebugListener = function (listener) {
        if (!listener) {
            this._d = false;
            this._dl = NO;
        }
        else {
            this._d = true;
            listener._n = listener.next;
            listener._e = listener.error;
            listener._c = listener.complete;
            this._dl = listener;
        }
    };
    /**
     * Blends multiple streams together, emitting events from all of them
     * concurrently.
     *
     * *merge* takes multiple streams as arguments, and creates a stream that
     * behaves like each of the argument streams, in parallel.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b----c---d------
     *            merge
     * --1-a--2--b--3-c---d--4---
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to merge together with other streams.
     * @param {Stream} stream2 A stream to merge together with other streams. Two
     * or more streams may be given as arguments.
     * @return {Stream}
     */
    Stream.merge = function merge() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new MergeProducer(streams));
    };
    /**
     * Combines multiple input streams together to return a stream whose events
     * are arrays that collect the latest events from each input stream.
     *
     * *combine* internally remembers the most recent event from each of the input
     * streams. When any of the input streams emits an event, that event together
     * with all the other saved events are combined into an array. That array will
     * be emitted on the output stream. It's essentially a way of joining together
     * the events from multiple streams.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b-----c--d------
     *          combine
     * ----1a-2a-2b-3b-3c-3d-4d--
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to combine together with other streams.
     * @param {Stream} stream2 A stream to combine together with other streams.
     * Multiple streams, not just two, may be given as arguments.
     * @return {Stream}
     */
    Stream.combine = function combine() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new CombineProducer(streams));
    };
    return Stream;
}());
exports.Stream = Stream;
var MemoryStream = (function (_super) {
    __extends(MemoryStream, _super);
    function MemoryStream(producer) {
        _super.call(this, producer);
        this._has = false;
    }
    MemoryStream.prototype._n = function (x) {
        this._v = x;
        this._has = true;
        _super.prototype._n.call(this, x);
    };
    MemoryStream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1) {
            if (this._has)
                il._n(this._v);
            return;
        }
        if (this._stopID !== NO) {
            if (this._has)
                il._n(this._v);
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else if (this._has)
            il._n(this._v);
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    MemoryStream.prototype._stopNow = function () {
        this._has = false;
        _super.prototype._stopNow.call(this);
    };
    MemoryStream.prototype._x = function () {
        this._has = false;
        _super.prototype._x.call(this);
    };
    MemoryStream.prototype.map = function (project) {
        return this._map(project);
    };
    MemoryStream.prototype.mapTo = function (projectedValue) {
        return _super.prototype.mapTo.call(this, projectedValue);
    };
    MemoryStream.prototype.take = function (amount) {
        return _super.prototype.take.call(this, amount);
    };
    MemoryStream.prototype.endWhen = function (other) {
        return _super.prototype.endWhen.call(this, other);
    };
    MemoryStream.prototype.replaceError = function (replace) {
        return _super.prototype.replaceError.call(this, replace);
    };
    MemoryStream.prototype.remember = function () {
        return this;
    };
    MemoryStream.prototype.debug = function (labelOrSpy) {
        return _super.prototype.debug.call(this, labelOrSpy);
    };
    return MemoryStream;
}(Stream));
exports.MemoryStream = MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Stream;

},{"symbol-observable":4}],8:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var ConcatProducer = (function () {
    function ConcatProducer(streams) {
        this.streams = streams;
        this.type = 'concat';
        this.out = null;
        this.i = 0;
    }
    ConcatProducer.prototype._start = function (out) {
        this.out = out;
        this.streams[this.i]._add(this);
    };
    ConcatProducer.prototype._stop = function () {
        var streams = this.streams;
        if (this.i < streams.length) {
            streams[this.i]._remove(this);
        }
        this.i = 0;
        this.out = null;
    };
    ConcatProducer.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        u._n(t);
    };
    ConcatProducer.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    ConcatProducer.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var streams = this.streams;
        streams[this.i]._remove(this);
        if (++this.i < streams.length) {
            streams[this.i]._add(this);
        }
        else {
            u._c();
        }
    };
    return ConcatProducer;
}());
/**
 * Puts one stream after the other. *concat* is a factory that takes multiple
 * streams as arguments, and starts the `n+1`-th stream only when the `n`-th
 * stream has completed. It concatenates those streams together.
 *
 * Marble diagram:
 *
 * ```text
 * --1--2---3---4-|
 * ...............--a-b-c--d-|
 *           concat
 * --1--2---3---4---a-b-c--d-|
 * ```
 *
 * Example:
 *
 * ```js
 * import concat from 'xstream/extra/concat'
 *
 * const streamA = xs.of('a', 'b', 'c')
 * const streamB = xs.of(10, 20, 30)
 * const streamC = xs.of('X', 'Y', 'Z')
 *
 * const outputStream = concat(streamA, streamB, streamC)
 *
 * outputStream.addListener({
 *   next: (x) => console.log(x),
 *   error: (err) => console.error(err),
 *   complete: () => console.log('concat completed'),
 * })
 * ```
 *
 * @factory true
 * @param {Stream} stream1 A stream to concatenate together with other streams.
 * @param {Stream} stream2 A stream to concatenate together with other streams. Two
 * or more streams may be given as arguments.
 * @return {Stream}
 */
function concat() {
    var streams = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        streams[_i - 0] = arguments[_i];
    }
    return new core_1.Stream(new ConcatProducer(streams));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = concat;

},{"../core":7}],9:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var DelayOperator = (function () {
    function DelayOperator(dt, ins) {
        this.dt = dt;
        this.ins = ins;
        this.type = 'delay';
        this.out = null;
    }
    DelayOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DelayOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = null;
    };
    DelayOperator.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._n(t);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._e(err);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._c();
            clearInterval(id);
        }, this.dt);
    };
    return DelayOperator;
}());
/**
 * Delays periodic events by a given time period.
 *
 * Marble diagram:
 *
 * ```text
 * 1----2--3--4----5|
 *     delay(60)
 * ---1----2--3--4----5|
 * ```
 *
 * Example:
 *
 * ```js
 * import fromDiagram from 'xstream/extra/fromDiagram'
 * import delay from 'xstream/extra/delay'
 *
 * const stream = fromDiagram('1----2--3--4----5|')
 *  .compose(delay(60))
 *
 * stream.addListener({
 *   next: i => console.log(i),
 *   error: err => console.error(err),
 *   complete: () => console.log('completed')
 * })
 * ```
 *
 * ```text
 * > 1  (after 60 ms)
 * > 2  (after 160 ms)
 * > 3  (after 220 ms)
 * > 4  (after 280 ms)
 * > 5  (after 380 ms)
 * > completed
 * ```
 *
 * @param {number} period The amount of silence required in milliseconds.
 * @return {Stream}
 */
function delay(period) {
    return function delayOperator(ins) {
        return new core_1.Stream(new DelayOperator(period, ins));
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = delay;

},{"../core":7}],10:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var FCIL = (function () {
    function FCIL(out, op) {
        this.out = out;
        this.op = op;
    }
    FCIL.prototype._n = function (t) {
        this.out._n(t);
    };
    FCIL.prototype._e = function (err) {
        this.out._e(err);
    };
    FCIL.prototype._c = function () {
        this.op.less();
    };
    return FCIL;
}());
var FlattenConcOperator = (function () {
    function FlattenConcOperator(ins) {
        this.ins = ins;
        this.type = 'flattenConcurrently';
        this.active = 1; // number of outers and inners that have not yet ended
        this.out = null;
    }
    FlattenConcOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    FlattenConcOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.active = 1;
        this.out = null;
    };
    FlattenConcOperator.prototype.less = function () {
        if (--this.active === 0) {
            var u = this.out;
            if (!u)
                return;
            u._c();
        }
    };
    FlattenConcOperator.prototype._n = function (s) {
        var u = this.out;
        if (!u)
            return;
        this.active++;
        s._add(new FCIL(u, this));
    };
    FlattenConcOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    FlattenConcOperator.prototype._c = function () {
        this.less();
    };
    return FlattenConcOperator;
}());
exports.FlattenConcOperator = FlattenConcOperator;
/**
 * Flattens a "stream of streams", handling multiple concurrent nested streams
 * simultaneously.
 *
 * If the input stream is a stream that emits streams, then this operator will
 * return an output stream which is a flat stream: emits regular events. The
 * flattening happens concurrently. It works like this: when the input stream
 * emits a nested stream, *flattenConcurrently* will start imitating that
 * nested one. When the next nested stream is emitted on the input stream,
 * *flattenConcurrently* will also imitate that new one, but will continue to
 * imitate the previous nested streams as well.
 *
 * Marble diagram:
 *
 * ```text
 * --+--------+---------------
 *   \        \
 *    \       ----1----2---3--
 *    --a--b----c----d--------
 *     flattenConcurrently
 * -----a--b----c-1--d-2---3--
 * ```
 *
 * @return {Stream}
 */
function flattenConcurrently(ins) {
    return new core_1.Stream(new FlattenConcOperator(ins));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = flattenConcurrently;

},{"../core":7}],11:[function(require,module,exports){
"use strict";
var core_1 = require('./core');
exports.Stream = core_1.Stream;
exports.MemoryStream = core_1.MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = core_1.Stream;

},{"./core":7}],12:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Alt = function (Functor0, alt) {
    this.Functor0 = Functor0;
    this.alt = alt;
};
var altArray = new Alt(function () {
    return Data_Functor.functorArray;
}, Data_Semigroup.append(Data_Semigroup.semigroupArray));
var alt = function (dict) {
    return dict.alt;
};
module.exports = {
    Alt: Alt, 
    alt: alt, 
    altArray: altArray
};

},{"../Data.Functor":107,"../Data.Semigroup":141}],13:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Alternative = function (Applicative0, Plus1) {
    this.Applicative0 = Applicative0;
    this.Plus1 = Plus1;
};
var alternativeArray = new Alternative(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Plus.plusArray;
});
module.exports = {
    Alternative: Alternative, 
    alternativeArray: alternativeArray
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Plus":66,"../Data.Functor":107}],14:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Applicative = function (Apply0, pure) {
    this.Apply0 = Apply0;
    this.pure = pure;
};
var pure = function (dict) {
    return dict.pure;
};
var unless = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (!v) {
                return v1;
            };
            if (v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 63, column 1 - line 63, column 19: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var when = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v) {
                return v1;
            };
            if (!v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 58, column 1 - line 58, column 16: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var liftA1 = function (dictApplicative) {
    return function (f) {
        return function (a) {
            return Control_Apply.apply(dictApplicative.Apply0())(pure(dictApplicative)(f))(a);
        };
    };
};
var applicativeFn = new Applicative(function () {
    return Control_Apply.applyFn;
}, function (x) {
    return function (v) {
        return x;
    };
});
var applicativeArray = new Applicative(function () {
    return Control_Apply.applyArray;
}, function (x) {
    return [ x ];
});
module.exports = {
    Applicative: Applicative, 
    liftA1: liftA1, 
    pure: pure, 
    unless: unless, 
    when: when, 
    applicativeFn: applicativeFn, 
    applicativeArray: applicativeArray
};

},{"../Control.Apply":16,"../Data.Functor":107,"../Data.Unit":157}],15:[function(require,module,exports){
"use strict";

exports.arrayApply = function (fs) {
  return function (xs) {
    var result = [];
    var n = 0;
    for (var i = 0, l = fs.length; i < l; i++) {
      for (var j = 0, k = xs.length; j < k; j++) {
        result[n++] = fs[i](xs[j]);
      }
    }
    return result;
  };
};

},{}],16:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Category = require("../Control.Category");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Apply = function (Functor0, apply) {
    this.Functor0 = Functor0;
    this.apply = apply;
};
var applyFn = new Apply(function () {
    return Data_Functor.functorFn;
}, function (f) {
    return function (g) {
        return function (x) {
            return f(x)(g(x));
        };
    };
});
var applyArray = new Apply(function () {
    return Data_Functor.functorArray;
}, $foreign.arrayApply);
var apply = function (dict) {
    return dict.apply;
};
var applyFirst = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply.Functor0())(Data_Function["const"])(a))(b);
        };
    };
};
var applySecond = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply.Functor0())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(a))(b);
        };
    };
};
var lift2 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return apply(dictApply)(Data_Functor.map(dictApply.Functor0())(f)(a))(b);
            };
        };
    };
};
var lift3 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply.Functor0())(f)(a))(b))(c);
                };
            };
        };
    };
};
var lift4 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply.Functor0())(f)(a))(b))(c))(d);
                    };
                };
            };
        };
    };
};
var lift5 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return apply(dictApply)(apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply.Functor0())(f)(a))(b))(c))(d))(e);
                        };
                    };
                };
            };
        };
    };
};
module.exports = {
    Apply: Apply, 
    apply: apply, 
    applyFirst: applyFirst, 
    applySecond: applySecond, 
    lift2: lift2, 
    lift3: lift3, 
    lift4: lift4, 
    lift5: lift5, 
    applyFn: applyFn, 
    applyArray: applyArray
};

},{"../Control.Category":21,"../Data.Function":102,"../Data.Functor":107,"./foreign":15}],17:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Biapply = require("../Control.Biapply");
var Biapplicative = function (Biapply0, bipure) {
    this.Biapply0 = Biapply0;
    this.bipure = bipure;
};
var bipure = function (dict) {
    return dict.bipure;
};
module.exports = {
    Biapplicative: Biapplicative, 
    bipure: bipure
};

},{"../Control.Biapply":18}],18:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Function = require("../Data.Function");
var Biapply = function (Bifunctor0, biapply) {
    this.Bifunctor0 = Bifunctor0;
    this.biapply = biapply;
};
var biapply = function (dict) {
    return dict.biapply;
};
var biapplyFirst = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply.Bifunctor0())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(Data_Function["const"](Control_Category.id(Control_Category.categoryFn))))(a))(b);
        };
    };
};
var biapplySecond = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply.Bifunctor0())(Data_Function["const"])(Data_Function["const"]))(a))(b);
        };
    };
};
var bilift2 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply.Bifunctor0())(f)(g))(a))(b);
                };
            };
        };
    };
};
var bilift3 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return function (c) {
                        return biapply(dictBiapply)(biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply.Bifunctor0())(f)(g))(a))(b))(c);
                    };
                };
            };
        };
    };
};
module.exports = {
    Biapply: Biapply, 
    biapply: biapply, 
    biapplyFirst: biapplyFirst, 
    biapplySecond: biapplySecond, 
    bilift2: bilift2, 
    bilift3: bilift3
};

},{"../Control.Category":21,"../Data.Bifunctor":82,"../Data.Function":102}],19:[function(require,module,exports){
"use strict";

exports.arrayBind = function (arr) {
  return function (f) {
    var result = [];
    for (var i = 0, l = arr.length; i < l; i++) {
      Array.prototype.push.apply(result, f(arr[i]));
    }
    return result;
  };
};

},{}],20:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Bind = function (Apply0, bind) {
    this.Apply0 = Apply0;
    this.bind = bind;
};
var Discard = function (discard) {
    this.discard = discard;
};
var discard = function (dict) {
    return dict.discard;
};
var bindFn = new Bind(function () {
    return Control_Apply.applyFn;
}, function (m) {
    return function (f) {
        return function (x) {
            return f(m(x))(x);
        };
    };
});
var bindArray = new Bind(function () {
    return Control_Apply.applyArray;
}, $foreign.arrayBind);
var bind = function (dict) {
    return dict.bind;
};
var bindFlipped = function (dictBind) {
    return Data_Function.flip(bind(dictBind));
};
var composeKleisliFlipped = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bindFlipped(dictBind)(f)(g(a));
            };
        };
    };
};
var composeKleisli = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bind(dictBind)(f(a))(g);
            };
        };
    };
};
var discardUnit = new Discard(function (dictBind) {
    return bind(dictBind);
});
var ifM = function (dictBind) {
    return function (cond) {
        return function (t) {
            return function (f) {
                return bind(dictBind)(cond)(function (cond$prime) {
                    if (cond$prime) {
                        return t;
                    };
                    return f;
                });
            };
        };
    };
};
var join = function (dictBind) {
    return function (m) {
        return bind(dictBind)(m)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Bind: Bind, 
    Discard: Discard, 
    bind: bind, 
    bindFlipped: bindFlipped, 
    composeKleisli: composeKleisli, 
    composeKleisliFlipped: composeKleisliFlipped, 
    discard: discard, 
    ifM: ifM, 
    join: join, 
    bindFn: bindFn, 
    bindArray: bindArray, 
    discardUnit: discardUnit
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Data.Function":102,"../Data.Functor":107,"../Data.Unit":157,"./foreign":19}],21:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Category = function (Semigroupoid0, id) {
    this.Semigroupoid0 = Semigroupoid0;
    this.id = id;
};
var id = function (dict) {
    return dict.id;
};
var categoryFn = new Category(function () {
    return Control_Semigroupoid.semigroupoidFn;
}, function (x) {
    return x;
});
module.exports = {
    Category: Category, 
    id: id, 
    categoryFn: categoryFn
};

},{"../Control.Semigroupoid":67}],22:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Extend = require("../Control.Extend");
var Data_Functor = require("../Data.Functor");
var Comonad = function (Extend0, extract) {
    this.Extend0 = Extend0;
    this.extract = extract;
};
var extract = function (dict) {
    return dict.extract;
};
module.exports = {
    Comonad: Comonad, 
    extract: extract
};

},{"../Control.Extend":25,"../Data.Functor":107}],23:[function(require,module,exports){
var Cycle = require('@cycle/xstream-run');

exports._run = function (_main, _driver) {
  return function () {
    function main (sources) {
      return {
        main: _main(sources.main)
      };
    }
    function driver (sink) {
      return _driver(sink)();
    }
    var dispose = Cycle.run(main, {
      main: driver
    });
    return function (unit) {
      return function () {
        dispose();
      };
    };
  };
};

},{"@cycle/xstream-run":3}],24:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_XStream = require("../Control.XStream");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Prelude = require("../Prelude");
var run = Data_Function_Uncurried.runFn2($foreign._run);
module.exports = {
    run: run
};

},{"../Control.Monad.Eff":47,"../Control.XStream":69,"../Data.Function.Uncurried":101,"../Prelude":168,"./foreign":23}],25:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Extend = function (Functor0, extend) {
    this.Functor0 = Functor0;
    this.extend = extend;
};
var extendFn = function (dictSemigroup) {
    return new Extend(function () {
        return Data_Functor.functorFn;
    }, function (f) {
        return function (g) {
            return function (w) {
                return f(function (w$prime) {
                    return g(Data_Semigroup.append(dictSemigroup)(w)(w$prime));
                });
            };
        };
    });
};
var extend = function (dict) {
    return dict.extend;
};
var extendFlipped = function (dictExtend) {
    return function (w) {
        return function (f) {
            return extend(dictExtend)(f)(w);
        };
    };
};
var duplicate = function (dictExtend) {
    return extend(dictExtend)(Control_Category.id(Control_Category.categoryFn));
};
var composeCoKleisliFlipped = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return f(extend(dictExtend)(g)(w));
            };
        };
    };
};
var composeCoKleisli = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return g(extend(dictExtend)(f)(w));
            };
        };
    };
};
module.exports = {
    Extend: Extend, 
    composeCoKleisli: composeCoKleisli, 
    composeCoKleisliFlipped: composeCoKleisliFlipped, 
    duplicate: duplicate, 
    extend: extend, 
    extendFlipped: extendFlipped, 
    extendFn: extendFn
};

},{"../Control.Category":21,"../Data.Functor":107,"../Data.Semigroup":141}],26:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Unit = require("../Data.Unit");
var Lazy = function (defer) {
    this.defer = defer;
};
var defer = function (dict) {
    return dict.defer;
};
var fix = function (dictLazy) {
    return function (f) {
        return defer(dictLazy)(function (v) {
            return f(fix(dictLazy)(f));
        });
    };
};
module.exports = {
    Lazy: Lazy, 
    defer: defer, 
    fix: fix
};

},{"../Data.Unit":157}],27:[function(require,module,exports){
"use strict";

exports._makeVar = function (nonCanceler) {
  return function (success) {
    success({
      consumers: [],
      producers: [],
      error: undefined
    });
    return nonCanceler;
  };
};

exports._takeVar = function (nonCanceler, avar) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.producers.length > 0) {
      avar.producers.shift()(success, error);
    } else {
      avar.consumers.push({ peek: false, success: success, error: error });
    }

    return nonCanceler;
  };
};

exports._peekVar = function (nonCanceler, avar) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.producers.length > 0) {
      avar.producers[0](success, error);
    } else {
      avar.consumers.push({ peek: true, success: success, error: error });
    }
    return nonCanceler;
  };
};

exports._putVar = function (nonCanceler, avar, a) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else {
      var shouldQueue = true;
      var consumers = [];
      var consumer;

      while (true) {
        consumer = avar.consumers.shift();
        if (consumer) {
          consumers.push(consumer);
          if (consumer.peek) {
            continue;
          } else {
            shouldQueue = false;
          }
        }
        break;
      }

      if (shouldQueue) {
        avar.producers.push(function (success) {
          success(a);
          return nonCanceler;
        });
      }

      for (var i = 0; i < consumers.length; i++) {
        consumers[i].success(a);
      }

      success({});
    }

    return nonCanceler;
  };
};

exports._killVar = function (nonCanceler, avar, e) {
  return function (success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else {
      avar.error = e;
      while (avar.consumers.length) {
        avar.consumers.shift().error(e);
      }
      success({});
    }

    return nonCanceler;
  };
};

},{}],28:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Prelude = require("../Prelude");
module.exports = {
    _killVar: $foreign._killVar, 
    _makeVar: $foreign._makeVar, 
    _peekVar: $foreign._peekVar, 
    _putVar: $foreign._putVar, 
    _takeVar: $foreign._takeVar
};

},{"../Control.Monad.Eff.Exception":37,"../Data.Function.Uncurried":101,"../Prelude":168,"./foreign":27}],29:[function(require,module,exports){
/* globals setTimeout, clearTimeout, setImmediate, clearImmediate */
"use strict";

exports._cancelWith = function (nonCanceler, aff, canceler1) {
  return function (success, error) {
    var canceler2 = aff(success, error);

    return function (e) {
      return function (success, error) {
        var cancellations = 0;
        var result = false;
        var errored = false;

        var s = function (bool) {
          cancellations = cancellations + 1;
          result = result || bool;

          if (cancellations === 2 && !errored) {
            success(result);
          }
        };

        var f = function (err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        canceler2(e)(s, f);
        canceler1(e)(s, f);

        return nonCanceler;
      };
    };
  };
};

exports._delay = function (nonCanceler, millis) {
  var set = setTimeout;
  var clear = clearTimeout;
  if (millis <= 0 && typeof setImmediate === "function") {
    set = setImmediate;
    clear = clearImmediate;
  }
  return function (success) {
    var timedOut = false;
    var timer = set(function () {
      timedOut = true;
      success();
    }, millis);

    return function () {
      return function (s) {
        if (timedOut) {
          s(false);
        } else {
          clear(timer);
          s(true);
        }
        return nonCanceler;
      };
    };
  };
};

exports._unsafeInterleaveAff = function (aff) {
  return aff;
};

exports._forkAff = function (nonCanceler, aff) {
  var voidF = function () {};

  return function (success) {
    var canceler = aff(voidF, voidF);
    success(canceler);
    return nonCanceler;
  };
};

exports._forkAll = function (nonCanceler, foldl, affs) {
  var voidF = function () {};

  return function (success) {
    var cancelers = foldl(function (acc) {
      return function (aff) {
        acc.push(aff(voidF, voidF));
        return acc;
      };
    })([])(affs);

    var canceler = function (e) {
      return function (success, error) {
        var cancellations = 0;
        var result        = false;
        var errored       = false;

        var s = function (bool) {
          cancellations = cancellations + 1;
          result        = result || bool;

          if (cancellations === cancelers.length && !errored) {
            success(result);
          }
        };

        var f = function (err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        for (var i = 0; i < cancelers.length; i++) {
          cancelers[i](e)(s, f);
        }

        return nonCanceler;
      };
    };

    success(canceler);
    return nonCanceler;
  };
};

exports._makeAff = function (cb) {
  return function (success, error) {
    try {
      return cb(function (e) {
        return function () {
          error(e);
        };
      })(function (v) {
        return function () {
          success(v);
        };
      })();
    } catch (err) {
      error(err);
    }
  };
};

exports._pure = function (nonCanceler, v) {
  return function (success) {
    success(v);
    return nonCanceler;
  };
};

exports._throwError = function (nonCanceler, e) {
  return function (success, error) {
    error(e);
    return nonCanceler;
  };
};

exports._fmap = function (f, aff) {
  return function (success, error) {
    return aff(function (v) {
      success(f(v));
    }, error);
  };
};

exports._bind = function (alwaysCanceler, aff, f) {
  return function (success, error) {
    var canceler1, canceler2;

    var isCanceled    = false;
    var requestCancel = false;

    var onCanceler = function () {};

    canceler1 = aff(function (v) {
      if (requestCancel) {
        isCanceled = true;

        return alwaysCanceler;
      } else {
        canceler2 = f(v)(success, error);

        onCanceler(canceler2);

        return canceler2;
      }
    }, error);

    return function (e) {
      return function (s, f) {
        requestCancel = true;

        if (canceler2 !== undefined) {
          return canceler2(e)(s, f);
        } else {
          return canceler1(e)(function (bool) {
            if (bool || isCanceled) {
              s(true);
            } else {
              onCanceler = function (canceler) {
                canceler(e)(s, f);
              };
            }
          }, f);
        }
      };
    };
  };
};

exports._attempt = function (Left, Right, aff) {
  return function (success) {
    return aff(function (v) {
      success(Right(v));
    }, function (e) {
      success(Left(e));
    });
  };
};

exports._runAff = function (errorT, successT, aff) {
  // If errorT or successT throw, and an Aff is comprised only of synchronous
  // effects, then it's possible for makeAff/liftEff to accidentally catch
  // it, which may end up rerunning the Aff depending on error recovery
  // behavior. To mitigate this, we observe synchronicity using mutation. If
  // an Aff is observed to be synchronous, we let the stack reset and run the
  // handlers outside of the normal callback flow.
  return function () {
    var status = 0;
    var result, success;

    var canceler = aff(function (v) {
      if (status === 2) {
        successT(v)();
      } else {
        status = 1;
        result = v;
        success = true;
      }
    }, function (e) {
      if (status === 2) {
        errorT(e)();
      } else {
        status = 1;
        result = e;
        success = false;
      }
    });

    if (status === 1) {
      if (success) {
        successT(result)();
      } else {
        errorT(result)();
      }
    } else {
      status = 2;
    }

    return canceler;
  };
};

exports._liftEff = function (nonCanceler, e) {
  return function (success, error) {
    var result;
    try {
      result = e();
    } catch (err) {
      error(err);
      return nonCanceler;
    }

    success(result);
    return nonCanceler;
  };
};

exports._tailRecM = function (isLeft, f, a) {
  return function (success, error) {
    return function go (acc) {
      var result, status, canceler;

      // Observes synchronous effects using a flag.
      //   status = 0 (unresolved status)
      //   status = 1 (synchronous effect)
      //   status = 2 (asynchronous effect)

      var csuccess = function (v) {
        // If the status is still unresolved, we have observed a
        // synchronous effect. Otherwise, the status will be `2`.
        if (status === 0) {
          // Store the result for further synchronous processing.
          result = v;
          status = 1;
        } else {
          // When we have observed an asynchronous effect, we use normal
          // recursion. This is safe because we will be on a new stack.
          if (isLeft(v)) {
            go(v.value0);
          } else {
            success(v.value0);
          }
        }
      };

      while (true) {
        status = 0;
        canceler = f(acc)(csuccess, error);

        // If the status has already resolved to `1` by our Aff handler, then
        // we have observed a synchronous effect. Otherwise it will still be
        // `0`.
        if (status === 1) {
          // When we have observed a synchronous effect, we merely swap out the
          // accumulator and continue the loop, preserving stack.
          if (isLeft(result)) {
            acc = result.value0;
            continue;
          } else {
            success(result.value0);
          }
        } else {
          // If the status has not resolved yet, then we have observed an
          // asynchronous effect.
          status = 2;
        }
        return canceler;
      }

    }(a);
  };
};

},{}],30:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Aff_Internal = require("../Control.Monad.Aff.Internal");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Parallel = require("../Control.Parallel");
var Control_Parallel_Class = require("../Control.Parallel.Class");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Time_Duration = require("../Data.Time.Duration");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Unsafe_Coerce = require("../Unsafe.Coerce");
var ParAff = function (x) {
    return x;
};
var Canceler = function (x) {
    return x;
};
var runAff = function (ex) {
    return function (f) {
        return function (aff) {
            return $foreign._runAff(ex, f, aff);
        };
    };
};
var newtypeParAff = new Data_Newtype.Newtype(function (n) {
    return n;
}, ParAff);
var makeAff$prime = function (h) {
    return $foreign._makeAff(h);
};
var functorAff = new Data_Functor.Functor(function (f) {
    return function (fa) {
        return $foreign._fmap(f, fa);
    };
});
var functorParAff = functorAff;
var fromAVBox = Unsafe_Coerce.unsafeCoerce;
var cancel = function (v) {
    return v;
};
var launchAff = (function () {
    var lowerEx = Data_Functor.map(Control_Monad_Eff.functorEff)(function ($54) {
        return Canceler(Data_Functor.map(Data_Functor.functorFn)($foreign._unsafeInterleaveAff)(cancel($54)));
    });
    return function ($55) {
        return lowerEx(runAff(Control_Monad_Eff_Exception.throwException)(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))($foreign._unsafeInterleaveAff($55)));
    };
})();
var attempt = function (aff) {
    return $foreign._attempt(Data_Either.Left.create, Data_Either.Right.create, aff);
};
var apathize = function (a) {
    return Data_Functor.map(functorAff)(Data_Function["const"](Data_Unit.unit))(attempt(a));
};
var applyAff = new Control_Apply.Apply(function () {
    return functorAff;
}, function (ff) {
    return function (fa) {
        return $foreign._bind(alwaysCanceler, ff, function (f) {
            return Data_Functor.map(functorAff)(f)(fa);
        });
    };
});
var applicativeAff = new Control_Applicative.Applicative(function () {
    return applyAff;
}, function (v) {
    return $foreign._pure(nonCanceler, v);
});
var nonCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(false));
var alwaysCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(true));
var cancelWith = function (aff) {
    return function (c) {
        return $foreign._cancelWith(nonCanceler, aff, c);
    };
};
var delay = function (v) {
    return $foreign._delay(nonCanceler, v);
};
var forkAff = function (aff) {
    return $foreign._forkAff(nonCanceler, aff);
};
var forkAll = function (dictFoldable) {
    return function (affs) {
        return $foreign._forkAll(nonCanceler, Data_Foldable.foldl(dictFoldable), affs);
    };
};
var killVar = function (q) {
    return function (e) {
        return fromAVBox(Control_Monad_Aff_Internal._killVar(nonCanceler, q, e));
    };
};
var liftEff$prime = function (eff) {
    return attempt($foreign._unsafeInterleaveAff($foreign._liftEff(nonCanceler, eff)));
};
var makeAff = function (h) {
    return makeAff$prime(function (e) {
        return function (a) {
            return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Function["const"](nonCanceler))(h(e)(a));
        };
    });
};
var makeVar = fromAVBox(Control_Monad_Aff_Internal._makeVar(nonCanceler));
var putVar = function (q) {
    return function (a) {
        return fromAVBox(Control_Monad_Aff_Internal._putVar(nonCanceler, q, a));
    };
};
var takeVar = function (q) {
    return fromAVBox(Control_Monad_Aff_Internal._takeVar(nonCanceler, q));
};
var semigroupAff = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (a) {
        return function (b) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_Semigroup.append(dictSemigroup))(a))(b);
        };
    });
};
var monoidAff = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAff(dictMonoid.Semigroup0());
    }, Control_Applicative.pure(applicativeAff)(Data_Monoid.mempty(dictMonoid)));
};
var semigroupCanceler = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function (e) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_HeytingAlgebra.disj(Data_HeytingAlgebra.heytingAlgebraBoolean))(v(e)))(v1(e));
        };
    };
});
var monoidCanceler = new Data_Monoid.Monoid(function () {
    return semigroupCanceler;
}, Data_Function["const"](Control_Applicative.pure(applicativeAff)(true)));
var bindAff = new Control_Bind.Bind(function () {
    return applyAff;
}, function (fa) {
    return function (f) {
        return $foreign._bind(alwaysCanceler, fa, f);
    };
});
var applyParAff = new Control_Apply.Apply(function () {
    return functorParAff;
}, function (v) {
    return function (v1) {
        var putOrKill = function (v2) {
            return Data_Either.either(killVar(v2))(putVar(v2));
        };
        return Control_Bind.bind(bindAff)(makeVar)(function (v2) {
            return Control_Bind.bind(bindAff)(makeVar)(function (v3) {
                return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v2))(attempt(v))))(function (v4) {
                    return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v3))(attempt(v1))))(function (v5) {
                        return cancelWith(Control_Apply.apply(applyAff)(takeVar(v2))(takeVar(v3)))(Data_Semigroup.append(semigroupCanceler)(v4)(v5));
                    });
                });
            });
        });
    };
});
var applicativeParAff = new Control_Applicative.Applicative(function () {
    return applyParAff;
}, function ($56) {
    return ParAff(Control_Applicative.pure(applicativeAff)($56));
});
var semigroupParAff = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (a) {
        return function (b) {
            return Control_Apply.apply(applyParAff)(Data_Functor.map(functorParAff)(Data_Semigroup.append(dictSemigroup))(a))(b);
        };
    });
};
var monoidParAff = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupParAff(dictMonoid.Semigroup0());
    }, Control_Applicative.pure(applicativeParAff)(Data_Monoid.mempty(dictMonoid)));
};
var monadAff = new Control_Monad.Monad(function () {
    return applicativeAff;
}, function () {
    return bindAff;
});
var monadEffAff = new Control_Monad_Eff_Class.MonadEff(function () {
    return monadAff;
}, function (eff) {
    return $foreign._liftEff(nonCanceler, eff);
});
var monadRecAff = new Control_Monad_Rec_Class.MonadRec(function () {
    return monadAff;
}, function (f) {
    return function (a) {
        var isLoop = function (v) {
            if (v instanceof Control_Monad_Rec_Class.Loop) {
                return true;
            };
            return false;
        };
        return $foreign._tailRecM(isLoop, f, a);
    };
});
var monadThrowAff = new Control_Monad_Error_Class.MonadThrow(function () {
    return monadAff;
}, function (e) {
    return $foreign._throwError(nonCanceler, e);
});
var $$finally = function (aff1) {
    return function (aff2) {
        return Control_Bind.bind(bindAff)(attempt(aff1))(function (v) {
            return Control_Bind.bind(bindAff)(aff2)(function (v1) {
                return Data_Either.either(Control_Monad_Error_Class.throwError(monadThrowAff))(Control_Applicative.pure(applicativeAff))(v);
            });
        });
    };
};
var parallelParAff = new Control_Parallel_Class.Parallel(function () {
    return applicativeParAff;
}, function () {
    return monadAff;
}, ParAff, function (v) {
    return v;
});
var monadErrorAff = new Control_Monad_Error_Class.MonadError(function () {
    return monadThrowAff;
}, function (aff) {
    return function (ex) {
        return Control_Bind.bind(bindAff)(attempt(aff))(Data_Either.either(ex)(Control_Applicative.pure(applicativeAff)));
    };
});
var altParAff = new Control_Alt.Alt(function () {
    return functorParAff;
}, function (v) {
    return function (v1) {
        var maybeKill = function (va) {
            return function (ve) {
                return function (err) {
                    return Control_Bind.bind(bindAff)(takeVar(ve))(function (v2) {
                        return Control_Bind.discard(Control_Bind.discardUnit)(bindAff)(Control_Applicative.when(applicativeAff)(v2 === 1)(killVar(va)(err)))(function () {
                            return putVar(ve)(v2 + 1 | 0);
                        });
                    });
                };
            };
        };
        var done = function (cs) {
            return function (get) {
                return function (va) {
                    return function (x) {
                        return Control_Bind.discard(Control_Bind.discardUnit)(bindAff)(putVar(va)(x))(function () {
                            return Control_Bind.bind(bindAff)(Data_Functor.map(functorAff)(get)(takeVar(cs)))(function (v2) {
                                return Data_Functor["void"](functorAff)(cancel(v2)(Control_Monad_Eff_Exception.error("Alt early exit")));
                            });
                        });
                    };
                };
            };
        };
        return Control_Bind.bind(bindAff)(makeVar)(function (v2) {
            return Control_Bind.bind(bindAff)(makeVar)(function (v3) {
                return Control_Bind.bind(bindAff)(makeVar)(function (v4) {
                    return Control_Bind.discard(Control_Bind.discardUnit)(bindAff)(putVar(v3)(0))(function () {
                        return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v2)(v3))(done(v4)(Data_Tuple.snd)(v2)))(attempt(v))))(function (v5) {
                            return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v2)(v3))(done(v4)(Data_Tuple.fst)(v2)))(attempt(v1))))(function (v6) {
                                return Control_Bind.discard(Control_Bind.discardUnit)(bindAff)(putVar(v4)(new Data_Tuple.Tuple(v5, v6)))(function () {
                                    return cancelWith(takeVar(v2))(Data_Semigroup.append(semigroupCanceler)(v5)(v6));
                                });
                            });
                        });
                    });
                });
            });
        });
    };
});
var altAff = new Control_Alt.Alt(function () {
    return functorAff;
}, function (a1) {
    return function (a2) {
        return Control_Bind.bind(bindAff)(attempt(a1))(Data_Either.either(Data_Function["const"](a2))(Control_Applicative.pure(applicativeAff)));
    };
});
var plusAff = new Control_Plus.Plus(function () {
    return altAff;
}, Control_Monad_Error_Class.throwError(monadThrowAff)(Control_Monad_Eff_Exception.error("Always fails")));
var alternativeAff = new Control_Alternative.Alternative(function () {
    return applicativeAff;
}, function () {
    return plusAff;
});
var monadZero = new Control_MonadZero.MonadZero(function () {
    return alternativeAff;
}, function () {
    return monadAff;
});
var monadPlusAff = new Control_MonadPlus.MonadPlus(function () {
    return monadZero;
});
var plusParAff = new Control_Plus.Plus(function () {
    return altParAff;
}, Control_Plus.empty(plusAff));
var alternativeParAff = new Control_Alternative.Alternative(function () {
    return applicativeParAff;
}, function () {
    return plusParAff;
});
module.exports = {
    Canceler: Canceler, 
    ParAff: ParAff, 
    apathize: apathize, 
    attempt: attempt, 
    cancel: cancel, 
    cancelWith: cancelWith, 
    delay: delay, 
    "finally": $$finally, 
    forkAff: forkAff, 
    forkAll: forkAll, 
    launchAff: launchAff, 
    "liftEff'": liftEff$prime, 
    makeAff: makeAff, 
    "makeAff'": makeAff$prime, 
    nonCanceler: nonCanceler, 
    runAff: runAff, 
    semigroupAff: semigroupAff, 
    monoidAff: monoidAff, 
    functorAff: functorAff, 
    applyAff: applyAff, 
    applicativeAff: applicativeAff, 
    bindAff: bindAff, 
    monadAff: monadAff, 
    monadEffAff: monadEffAff, 
    monadThrowAff: monadThrowAff, 
    monadErrorAff: monadErrorAff, 
    altAff: altAff, 
    plusAff: plusAff, 
    alternativeAff: alternativeAff, 
    monadZero: monadZero, 
    monadPlusAff: monadPlusAff, 
    monadRecAff: monadRecAff, 
    semigroupCanceler: semigroupCanceler, 
    monoidCanceler: monoidCanceler, 
    newtypeParAff: newtypeParAff, 
    semigroupParAff: semigroupParAff, 
    monoidParAff: monoidParAff, 
    functorParAff: functorParAff, 
    applyParAff: applyParAff, 
    applicativeParAff: applicativeParAff, 
    altParAff: altParAff, 
    plusParAff: plusParAff, 
    alternativeParAff: alternativeParAff, 
    parallelParAff: parallelParAff
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Aff.Internal":28,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Class":33,"../Control.Monad.Eff.Exception":37,"../Control.Monad.Error.Class":48,"../Control.Monad.Rec.Class":54,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Parallel":65,"../Control.Parallel.Class":64,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Function.Uncurried":101,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Time.Duration":150,"../Data.Tuple":153,"../Data.Unit":157,"../Prelude":168,"../Unsafe.Coerce":171,"./foreign":29}],31:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Prelude = require("../Prelude");
var MonadCont = function (Monad0, callCC) {
    this.Monad0 = Monad0;
    this.callCC = callCC;
};
var callCC = function (dict) {
    return dict.callCC;
};
module.exports = {
    MonadCont: MonadCont, 
    callCC: callCC
};

},{"../Prelude":168}],32:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Prelude = require("../Prelude");
var ContT = function (x) {
    return x;
};
var withContT = function (f) {
    return function (v) {
        return function (k) {
            return v(f(k));
        };
    };
};
var runContT = function (v) {
    return function (k) {
        return v(k);
    };
};
var newtypeContT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ContT);
var monadTransContT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function (m) {
        return function (k) {
            return Control_Bind.bind(dictMonad.Bind1())(m)(k);
        };
    };
});
var mapContT = function (f) {
    return function (v) {
        return function (k) {
            return f(v(k));
        };
    };
};
var functorContT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return function (k) {
                return v(function (a) {
                    return k(f(a));
                });
            };
        };
    });
};
var applyContT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorContT(dictApply.Functor0());
    }, function (v) {
        return function (v1) {
            return function (k) {
                return v(function (g) {
                    return v1(function (a) {
                        return k(g(a));
                    });
                });
            };
        };
    });
};
var bindContT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyContT(dictBind.Apply0());
    }, function (v) {
        return function (k) {
            return function (k$prime) {
                return v(function (a) {
                    var v1 = k(a);
                    return v1(k$prime);
                });
            };
        };
    });
};
var applicativeContT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyContT(dictApplicative.Apply0());
    }, function (a) {
        return function (k) {
            return k(a);
        };
    });
};
var monadContT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeContT(dictMonad.Applicative0());
    }, function () {
        return bindContT(dictMonad.Bind1());
    });
};
var monadAskContT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadContT(dictMonadAsk.Monad0());
    }, Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadAsk.Monad0())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderContT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskContT(dictMonadReader.MonadAsk0());
    }, function (f) {
        return function (v) {
            return function (k) {
                return Control_Bind.bind(((dictMonadReader.MonadAsk0()).Monad0()).Bind1())(Control_Monad_Reader_Class.ask(dictMonadReader.MonadAsk0()))(function (v1) {
                    return Control_Monad_Reader_Class.local(dictMonadReader)(f)(v(function ($44) {
                        return Control_Monad_Reader_Class.local(dictMonadReader)(Data_Function["const"](v1))(k($44));
                    }));
                });
            };
        };
    });
};
var monadContContT = function (dictMonad) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadContT(dictMonad);
    }, function (f) {
        return function (k) {
            var v = f(function (a) {
                return function (v1) {
                    return k(a);
                };
            });
            return v(k);
        };
    });
};
var monadEffContT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadContT(dictMonadEff.Monad0());
    }, function ($45) {
        return Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadEff.Monad0())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($45));
    });
};
var monadStateContT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadContT(dictMonadState.Monad0());
    }, function ($46) {
        return Control_Monad_Trans_Class.lift(monadTransContT)(dictMonadState.Monad0())(Control_Monad_State_Class.state(dictMonadState)($46));
    });
};
module.exports = {
    ContT: ContT, 
    mapContT: mapContT, 
    runContT: runContT, 
    withContT: withContT, 
    newtypeContT: newtypeContT, 
    monadContContT: monadContContT, 
    functorContT: functorContT, 
    applyContT: applyContT, 
    applicativeContT: applicativeContT, 
    bindContT: bindContT, 
    monadContT: monadContT, 
    monadTransContT: monadTransContT, 
    monadEffContT: monadEffContT, 
    monadAskContT: monadAskContT, 
    monadReaderContT: monadReaderContT, 
    monadStateContT: monadStateContT
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Reader.Class":52,"../Control.Monad.State.Class":57,"../Control.Monad.Trans.Class":58,"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Functor":107,"../Data.Newtype":131,"../Prelude":168}],33:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var MonadEff = function (Monad0, liftEff) {
    this.Monad0 = Monad0;
    this.liftEff = liftEff;
};
var monadEffEff = new MonadEff(function () {
    return Control_Monad_Eff.monadEff;
}, Control_Category.id(Control_Category.categoryFn));
var liftEff = function (dict) {
    return dict.liftEff;
};
module.exports = {
    MonadEff: MonadEff, 
    liftEff: liftEff, 
    monadEffEff: monadEffEff
};

},{"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Eff":47}],34:[function(require,module,exports){
"use strict";

exports.log = function (s) {
  return function () {
    console.log(s);
    return {};
  };
};

exports.warn = function (s) {
  return function () {
    console.warn(s);
    return {};
  };
};

exports.error = function (s) {
  return function () {
    console.error(s);
    return {};
  };
};

exports.info = function (s) {
  return function () {
    console.info(s);
    return {};
  };
};

},{}],35:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var warnShow = function (dictShow) {
    return function (a) {
        return $foreign.warn(Data_Show.show(dictShow)(a));
    };
};
var logShow = function (dictShow) {
    return function (a) {
        return $foreign.log(Data_Show.show(dictShow)(a));
    };
};
var infoShow = function (dictShow) {
    return function (a) {
        return $foreign.info(Data_Show.show(dictShow)(a));
    };
};
var errorShow = function (dictShow) {
    return function (a) {
        return $foreign.error(Data_Show.show(dictShow)(a));
    };
};
module.exports = {
    errorShow: errorShow, 
    infoShow: infoShow, 
    logShow: logShow, 
    warnShow: warnShow, 
    error: $foreign.error, 
    info: $foreign.info, 
    log: $foreign.log, 
    warn: $foreign.warn
};

},{"../Control.Monad.Eff":47,"../Data.Show":145,"../Data.Unit":157,"./foreign":34}],36:[function(require,module,exports){
"use strict";

exports.showErrorImpl = function (err) {
  return err.stack || err.toString();
};

exports.error = function (msg) {
  return new Error(msg);
};

exports.message = function (e) {
  return e.message;
};

exports.stackImpl = function (just) {
  return function (nothing) {
    return function (e) {
      return e.stack ? just(e.stack) : nothing;
    };
  };
};

exports.throwException = function (e) {
  return function () {
    throw e;
  };
};

exports.catchException = function (c) {
  return function (t) {
    return function () {
      try {
        return t();
      } catch (e) {
        if (e instanceof Error || Object.prototype.toString.call(e) === "[object Error]") {
          return c(e)();
        } else {
          return c(new Error(e.toString()))();
        }
      }
    };
  };
};

},{}],37:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var $$try = function (action) {
    return $foreign.catchException(function ($0) {
        return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Either.Left.create($0));
    })(Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Either.Right.create)(action));
};
var $$throw = function ($1) {
    return $foreign.throwException($foreign.error($1));
};
var stack = $foreign.stackImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var showError = new Data_Show.Show($foreign.showErrorImpl);
module.exports = {
    stack: stack, 
    "throw": $$throw, 
    "try": $$try, 
    showError: showError, 
    catchException: $foreign.catchException, 
    error: $foreign.error, 
    message: $foreign.message, 
    throwException: $foreign.throwException
};

},{"../Control.Applicative":14,"../Control.Monad.Eff":47,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Show":145,"../Prelude":168,"./foreign":36}],38:[function(require,module,exports){
/* global exports */
"use strict";

exports.ready = function(func) {
    return function() {
        jQuery(document).ready(func);
    };
};

exports.select = function(selector) {
    return function() {
        return jQuery(selector);
    };
};

exports.find = function(selector) {
    return function(ob) {
        return function() {
            return ob.find(selector);
        };
    };
};

exports.parent = function(ob) {
    return function() {
        return ob.parent();
    };
};

exports.closest = function(selector) {
    return function(ob) {
        return function() {
            return ob.closest(selector);
        };
    };
};

exports.create = function(html) {
    return function() {
        return jQuery(html);
    };
};

exports.setAttr = function(attr) {
    return function(val) {
        return function(ob) {
            return function() {
                ob.attr(attr, val);
            };
        };
    };
};

exports.attr = function(attrs) {
    return function(ob) {
        return function() {
            ob.attr(attrs);
        };
    };
};

exports.css = function(props) {
    return function(ob) {
        return function() {
            ob.css(props);
        };
    };
};

exports.hasClass = function(cls) {
    return function(ob) {
        return function() {
            return ob.hasClass(cls);
        };
    };
};

exports.toggleClass = function(cls) {
    return function(ob) {
        return function() {
            ob.toggleClass(cls);
        };
    };
};

exports.setClass = function(cls) {
    return function(flag) {
        return function(ob) {
            return function() {
                ob.toggleClass(cls, flag);
            };
        };
    };
};

exports.setProp = function(p) {
    return function(val) {
        return function(ob) {
            return function() {
                ob.prop(p, val);
            };
        };
    };
};

exports.getProp = function(p) {
    return function(ob) {
        return function() {
            return ob.prop(p);
        };
    };
};

exports.append = function(ob1) {
    return function(ob) {
        return function() {
            ob.append(ob1);
        };
    };
};

exports.appendText = function(s) {
    return function(ob) {
        return function() {
            ob.append(s);
        };
    };
};

exports.body = function() {
    return jQuery(document.body);
};

exports.remove = function(ob) {
    return function() {
        ob.remove();
    };
};

exports.clear = function(ob) {
    return function() {
        ob.empty();
    };
};

exports.before = function(ob) {
    return function(ob1) {
        return function() {
            ob1.before(ob);
        };
    };
};

exports.getText = function(ob) {
    return function() {
        return ob.text();
    };
};

exports.setText = function(text) {
    return function(ob) {
        return function() {
            ob.text(text);
        };
    };
};

exports.getHtml = function(ob) {
    return function() {
        return ob.html();
    };
};

exports.setHtml = function(html) {
    return function(ob) {
        return function() {
            ob.html(html);
        };
    };
};

exports.getValue = function(ob) {
    return function() {
        return ob.val();
    };
};

exports.setValue = function(val) {
    return function(ob) {
        return function() {
            ob.val(val);
        };
    };
};

exports.toggle = function(ob) {
    return function() {
        ob.toggle();
    };
};

exports.setVisible = function(flag) {
    return function(ob) {
        return function() {
            ob.toggle(flag);
        };
    };
};

exports.toArray = function(ob) {
    return function() {
        var els = ob.toArray();
        var copy = [];
        for (var i = 0; i < els.length; i++) {
            copy.push(jQuery(els[i]));
        }
        return copy;
    };
};

exports.on = function(evt) {
    return function(act) {
        return function(ob) {
            return function() {
                ob.on(evt, function(e) {
                    act(e)(jQuery(this))();
                });
            };
        };
    };
};

exports["on'"] = function(evt) {
    return function(sel) {
        return function(act) {
            return function(ob) {
                return function() {
                    ob.on(evt, sel, function(e) {
                        act(e)(jQuery(this))();
                    });
                };
            };
        };
    };
};

exports.preventDefault = function(e) {
    return function() {
        e.preventDefault();
    };
};

exports.stopPropagation = function(e) {
    return function() {
        e.stopPropagation();
    };
};

exports.stopImmediatePropagation = function(e) {
    return function() {
        e.stopImmediatePropagation();
    };
};

exports.getTarget = function(e) {
    return function() {
        return jQuery(e.target);
    };
};

exports.getCurrentTarget = function(e) {
    return function() {
        return jQuery(e.currentTarget);
    };
};

exports.getPageX = function(e) {
    return function() {
        return jQuery(e.pageX);
    };
};

exports.getPageY = function(e) {
    return function() {
        return jQuery(e.pageY);
    };
};

exports.getWhich = function(e) {
    return function() {
        return jQuery(e.which);
    };
};

exports.getMetaKey = function(e) {
    return function() {
        return jQuery(e.metaKey);
    };
};


exports.clone = function(ob) {
    return function() {
        return ob.clone();
    };
};

exports.cloneWithDataAndEvents = function(ob) {
    return function() {
        return ob.clone(true);
    };
};

},{}],39:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var DOM = require("../DOM");
var Data_Foreign = require("../Data.Foreign");
var Prelude = require("../Prelude");
var removeClass = function (cls) {
    return $foreign.setClass(cls)(false);
};
var hide = $foreign.setVisible(false);
var display = $foreign.setVisible(true);
var addClass = function (cls) {
    return $foreign.setClass(cls)(true);
};
module.exports = {
    addClass: addClass, 
    display: display, 
    hide: hide, 
    removeClass: removeClass, 
    append: $foreign.append, 
    appendText: $foreign.appendText, 
    attr: $foreign.attr, 
    before: $foreign.before, 
    body: $foreign.body, 
    clear: $foreign.clear, 
    clone: $foreign.clone, 
    cloneWithDataAndEvents: $foreign.cloneWithDataAndEvents, 
    closest: $foreign.closest, 
    create: $foreign.create, 
    css: $foreign.css, 
    find: $foreign.find, 
    getCurrentTarget: $foreign.getCurrentTarget, 
    getHtml: $foreign.getHtml, 
    getMetaKey: $foreign.getMetaKey, 
    getPageX: $foreign.getPageX, 
    getPageY: $foreign.getPageY, 
    getProp: $foreign.getProp, 
    getTarget: $foreign.getTarget, 
    getText: $foreign.getText, 
    getValue: $foreign.getValue, 
    getWhich: $foreign.getWhich, 
    hasClass: $foreign.hasClass, 
    on: $foreign.on, 
    "on'": $foreign["on'"], 
    parent: $foreign.parent, 
    preventDefault: $foreign.preventDefault, 
    ready: $foreign.ready, 
    remove: $foreign.remove, 
    select: $foreign.select, 
    setAttr: $foreign.setAttr, 
    setClass: $foreign.setClass, 
    setHtml: $foreign.setHtml, 
    setProp: $foreign.setProp, 
    setText: $foreign.setText, 
    setValue: $foreign.setValue, 
    setVisible: $foreign.setVisible, 
    stopImmediatePropagation: $foreign.stopImmediatePropagation, 
    stopPropagation: $foreign.stopPropagation, 
    toArray: $foreign.toArray, 
    toggle: $foreign.toggle, 
    toggleClass: $foreign.toggleClass
};

},{"../Control.Monad.Eff":47,"../DOM":70,"../Data.Foreign":99,"../Prelude":168,"./foreign":38}],40:[function(require,module,exports){
"use strict";

exports.newRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports["modifyRef'"] = function (ref) {
  return function (f) {
    return function () {
      var t = f(ref.value);
      ref.value = t.state;
      return t.value;
    };
  };
};

exports.writeRef = function (ref) {
  return function (val) {
    return function () {
      ref.value = val;
      return {};
    };
  };
};

},{}],41:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var modifyRef = function (ref) {
    return function (f) {
        return $foreign["modifyRef'"](ref)(function (s) {
            return {
                state: f(s), 
                value: Data_Unit.unit
            };
        });
    };
};
module.exports = {
    modifyRef: modifyRef, 
    "modifyRef'": $foreign["modifyRef'"], 
    newRef: $foreign.newRef, 
    readRef: $foreign.readRef, 
    writeRef: $foreign.writeRef
};

},{"../Control.Monad.Eff":47,"../Data.Unit":157,"../Prelude":168,"./foreign":40}],42:[function(require,module,exports){
/* global exports */
"use strict";

exports.setTimeout = function (ms) {
  return function (fn) {
    return function () {
      return setTimeout(fn, ms);
    };
  };
};

exports.clearTimeout = function (id) {
  return function () {
    clearTimeout(id);
  };
};

exports.setInterval = function (ms) {
  return function (fn) {
    return function () {
      return setInterval(fn, ms);
    };
  };
};

exports.clearInterval = function (id) {
  return function () {
    clearInterval(id);
  };
};

},{}],43:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var Prelude = require("../Prelude");
var TimeoutId = function (x) {
    return x;
};
var IntervalId = function (x) {
    return x;
};
var eqTimeoutId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordTimeoutId = new Data_Ord.Ord(function () {
    return eqTimeoutId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
var eqIntervalId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordIntervalId = new Data_Ord.Ord(function () {
    return eqIntervalId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
module.exports = {
    eqTimeoutId: eqTimeoutId, 
    ordTimeoutId: ordTimeoutId, 
    eqIntervalId: eqIntervalId, 
    ordIntervalId: ordIntervalId, 
    clearInterval: $foreign.clearInterval, 
    clearTimeout: $foreign.clearTimeout, 
    setInterval: $foreign.setInterval, 
    setTimeout: $foreign.setTimeout
};

},{"../Control.Monad.Eff":47,"../Data.Eq":92,"../Data.Ord":136,"../Prelude":168,"./foreign":42}],44:[function(require,module,exports){
"use strict";

exports.unsafeCoerceEff = function (f) {
  return f;
};

},{}],45:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var unsafePerformEff = function ($0) {
    return Control_Monad_Eff.runPure($foreign.unsafeCoerceEff($0));
};
module.exports = {
    unsafePerformEff: unsafePerformEff, 
    unsafeCoerceEff: $foreign.unsafeCoerceEff
};

},{"../Control.Monad.Eff":47,"../Control.Semigroupoid":67,"./foreign":44}],46:[function(require,module,exports){
"use strict";

exports.pureE = function (a) {
  return function () {
    return a;
  };
};

exports.bindE = function (a) {
  return function (f) {
    return function () {
      return f(a())();
    };
  };
};

exports.runPure = function (f) {
  return f();
};

exports.untilE = function (f) {
  return function () {
    while (!f());
    return {};
  };
};

exports.whileE = function (f) {
  return function (a) {
    return function () {
      while (f()) {
        a();
      }
      return {};
    };
  };
};

exports.forE = function (lo) {
  return function (hi) {
    return function (f) {
      return function () {
        for (var i = lo; i < hi; i++) {
          f(i)();
        }
      };
    };
  };
};

exports.foreachE = function (as) {
  return function (f) {
    return function () {
      for (var i = 0, l = as.length; i < l; i++) {
        f(as[i])();
      }
    };
  };
};

},{}],47:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var monadEff = new Control_Monad.Monad(function () {
    return applicativeEff;
}, function () {
    return bindEff;
});
var bindEff = new Control_Bind.Bind(function () {
    return applyEff;
}, $foreign.bindE);
var applyEff = new Control_Apply.Apply(function () {
    return functorEff;
}, Control_Monad.ap(monadEff));
var applicativeEff = new Control_Applicative.Applicative(function () {
    return applyEff;
}, $foreign.pureE);
var functorEff = new Data_Functor.Functor(Control_Applicative.liftA1(applicativeEff));
module.exports = {
    functorEff: functorEff, 
    applyEff: applyEff, 
    applicativeEff: applicativeEff, 
    bindEff: bindEff, 
    monadEff: monadEff, 
    forE: $foreign.forE, 
    foreachE: $foreign.foreachE, 
    runPure: $foreign.runPure, 
    untilE: $foreign.untilE, 
    whileE: $foreign.whileE
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Data.Functor":107,"../Data.Unit":157,"./foreign":46}],48:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var MonadThrow = function (Monad0, throwError) {
    this.Monad0 = Monad0;
    this.throwError = throwError;
};
var MonadError = function (MonadThrow0, catchError) {
    this.MonadThrow0 = MonadThrow0;
    this.catchError = catchError;
};
var throwError = function (dict) {
    return dict.throwError;
};
var monadThrowMaybe = new MonadThrow(function () {
    return Data_Maybe.monadMaybe;
}, Data_Function["const"](Data_Maybe.Nothing.value));
var monadThrowEither = new MonadThrow(function () {
    return Data_Either.monadEither;
}, Data_Either.Left.create);
var monadErrorMaybe = new MonadError(function () {
    return monadThrowMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Nothing) {
            return v1(Data_Unit.unit);
        };
        if (v instanceof Data_Maybe.Just) {
            return new Data_Maybe.Just(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 77, column 3 - line 77, column 33: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var monadErrorEither = new MonadError(function () {
    return monadThrowEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Either.Left) {
            return v1(v.value0);
        };
        if (v instanceof Data_Either.Right) {
            return new Data_Either.Right(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 70, column 3 - line 70, column 30: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var catchError = function (dict) {
    return dict.catchError;
};
var catchJust = function (dictMonadError) {
    return function (p) {
        return function (act) {
            return function (handler) {
                var handle = function (e) {
                    var v = p(e);
                    if (v instanceof Data_Maybe.Nothing) {
                        return throwError(dictMonadError.MonadThrow0())(e);
                    };
                    if (v instanceof Data_Maybe.Just) {
                        return handler(v.value0);
                    };
                    throw new Error("Failed pattern match at Control.Monad.Error.Class line 54, column 5 - line 56, column 26: " + [ v.constructor.name ]);
                };
                return catchError(dictMonadError)(act)(handle);
            };
        };
    };
};
var $$try = function (dictMonadError) {
    return function (a) {
        return catchError(dictMonadError)(Data_Functor.map(((((dictMonadError.MonadThrow0()).Monad0()).Bind1()).Apply0()).Functor0())(Data_Either.Right.create)(a))(function ($21) {
            return Control_Applicative.pure(((dictMonadError.MonadThrow0()).Monad0()).Applicative0())(Data_Either.Left.create($21));
        });
    };
};
var withResource = function (dictMonadError) {
    return function (acquire) {
        return function (release) {
            return function (kleisli) {
                return Control_Bind.bind(((dictMonadError.MonadThrow0()).Monad0()).Bind1())(acquire)(function (v) {
                    return Control_Bind.bind(((dictMonadError.MonadThrow0()).Monad0()).Bind1())($$try(dictMonadError)(kleisli(v)))(function (v1) {
                        return Control_Bind.discard(Control_Bind.discardUnit)(((dictMonadError.MonadThrow0()).Monad0()).Bind1())(release(v))(function () {
                            return Data_Either.either(throwError(dictMonadError.MonadThrow0()))(Control_Applicative.pure(((dictMonadError.MonadThrow0()).Monad0()).Applicative0()))(v1);
                        });
                    });
                });
            };
        };
    };
};
module.exports = {
    MonadError: MonadError, 
    MonadThrow: MonadThrow, 
    catchError: catchError, 
    catchJust: catchJust, 
    throwError: throwError, 
    "try": $$try, 
    withResource: withResource, 
    monadThrowEither: monadThrowEither, 
    monadErrorEither: monadErrorEither, 
    monadThrowMaybe: monadThrowMaybe, 
    monadErrorMaybe: monadErrorMaybe
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Function":102,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Unit":157,"../Prelude":168}],49:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Tuple = require("../Data.Tuple");
var Prelude = require("../Prelude");
var ExceptT = function (x) {
    return x;
};
var withExceptT = function (dictFunctor) {
    return function (f) {
        return function (v) {
            var mapLeft = function (v1) {
                return function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return new Data_Either.Right(v2.value0);
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return new Data_Either.Left(v1(v2.value0));
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 44, column 3 - line 44, column 32: " + [ v1.constructor.name, v2.constructor.name ]);
                };
            };
            return ExceptT(Data_Functor.map(dictFunctor)(mapLeft(f))(v));
        };
    };
};
var runExceptT = function (v) {
    return v;
};
var newtypeExceptT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ExceptT);
var monadTransExceptT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function (m) {
        return Control_Bind.bind(dictMonad.Bind1())(m)(function (v) {
            return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Either.Right(v));
        });
    };
});
var mapExceptT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorExceptT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return mapExceptT(Data_Functor.map(dictFunctor)(Data_Functor.map(Data_Either.functorEither)(f)));
    });
};
var except = function (dictApplicative) {
    return function ($92) {
        return ExceptT(Control_Applicative.pure(dictApplicative)($92));
    };
};
var monadExceptT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeExceptT(dictMonad);
    }, function () {
        return bindExceptT(dictMonad);
    });
};
var bindExceptT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyExceptT(dictMonad);
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(Data_Either.either(function ($93) {
                return Control_Applicative.pure(dictMonad.Applicative0())(Data_Either.Left.create($93));
            })(function (a) {
                var v1 = k(a);
                return v1;
            }));
        };
    });
};
var applyExceptT = function (dictMonad) {
    return new Control_Apply.Apply(function () {
        return functorExceptT(((dictMonad.Bind1()).Apply0()).Functor0());
    }, Control_Monad.ap(monadExceptT(dictMonad)));
};
var applicativeExceptT = function (dictMonad) {
    return new Control_Applicative.Applicative(function () {
        return applyExceptT(dictMonad);
    }, function ($94) {
        return ExceptT(Control_Applicative.pure(dictMonad.Applicative0())(Data_Either.Right.create($94)));
    });
};
var monadAskExceptT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadExceptT(dictMonadAsk.Monad0());
    }, Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadAsk.Monad0())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderExceptT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskExceptT(dictMonadReader.MonadAsk0());
    }, function (f) {
        return mapExceptT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadContExceptT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadExceptT(dictMonadCont.Monad0());
    }, function (f) {
        return ExceptT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var v = f(function (a) {
                return ExceptT(c(new Data_Either.Right(a)));
            });
            return v;
        }));
    });
};
var monadEffExceptT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadExceptT(dictMonadEff.Monad0());
    }, function ($95) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadEff.Monad0())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($95));
    });
};
var monadRecExceptT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadExceptT(dictMonadRec.Monad0());
    }, function (f) {
        return function ($96) {
            return ExceptT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                return Control_Bind.bind((dictMonadRec.Monad0()).Bind1())((function () {
                    var v = f(a);
                    return v;
                })())(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0())((function () {
                        if (m$prime instanceof Data_Either.Left) {
                            return new Control_Monad_Rec_Class.Done(new Data_Either.Left(m$prime.value0));
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Control_Monad_Rec_Class.Loop) {
                            return new Control_Monad_Rec_Class.Loop(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Control_Monad_Rec_Class.Done) {
                            return new Control_Monad_Rec_Class.Done(new Data_Either.Right(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Except.Trans line 76, column 14 - line 79, column 43: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($96));
        };
    });
};
var monadStateExceptT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadExceptT(dictMonadState.Monad0());
    }, function (f) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadState.Monad0())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadTellExceptT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadExceptT(dictMonadTell.Monad0());
    }, function ($97) {
        return Control_Monad_Trans_Class.lift(monadTransExceptT)(dictMonadTell.Monad0())(Control_Monad_Writer_Class.tell(dictMonadTell)($97));
    });
};
var monadWriterExceptT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellExceptT(dictMonadWriter.MonadTell0());
    }, mapExceptT(function (m) {
        return Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())(Data_Functor.map(Data_Either.functorEither)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapExceptT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(m)(function (v) {
            return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())((function () {
                if (v instanceof Data_Either.Left) {
                    return new Data_Tuple.Tuple(new Data_Either.Left(v.value0), Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Either.Right) {
                    return new Data_Tuple.Tuple(new Data_Either.Right(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Except.Trans line 138, column 10 - line 140, column 44: " + [ v.constructor.name ]);
            })());
        }));
    }));
};
var monadThrowExceptT = function (dictMonad) {
    return new Control_Monad_Error_Class.MonadThrow(function () {
        return monadExceptT(dictMonad);
    }, function ($98) {
        return ExceptT(Control_Applicative.pure(dictMonad.Applicative0())(Data_Either.Left.create($98)));
    });
};
var monadErrorExceptT = function (dictMonad) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadThrowExceptT(dictMonad);
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(Data_Either.either(function (a) {
                var v1 = k(a);
                return v1;
            })(function ($99) {
                return Control_Applicative.pure(dictMonad.Applicative0())(Data_Either.Right.create($99));
            }));
        };
    });
};
var altExceptT = function (dictSemigroup) {
    return function (dictMonad) {
        return new Control_Alt.Alt(function () {
            return functorExceptT(((dictMonad.Bind1()).Apply0()).Functor0());
        }, function (v) {
            return function (v1) {
                return Control_Bind.bind(dictMonad.Bind1())(v)(function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Either.Right(v2.value0));
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return Control_Bind.bind(dictMonad.Bind1())(v1)(function (v3) {
                            if (v3 instanceof Data_Either.Right) {
                                return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Either.Right(v3.value0));
                            };
                            if (v3 instanceof Data_Either.Left) {
                                return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Either.Left(Data_Semigroup.append(dictSemigroup)(v2.value0)(v3.value0)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Except.Trans line 88, column 9 - line 90, column 49: " + [ v3.constructor.name ]);
                        });
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 84, column 5 - line 90, column 49: " + [ v2.constructor.name ]);
                });
            };
        });
    };
};
var plusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Plus.Plus(function () {
            return altExceptT(dictMonoid.Semigroup0())(dictMonad);
        }, Control_Monad_Error_Class.throwError(monadThrowExceptT(dictMonad))(Data_Monoid.mempty(dictMonoid)));
    };
};
var alternativeExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Alternative.Alternative(function () {
            return applicativeExceptT(dictMonad);
        }, function () {
            return plusExceptT(dictMonoid)(dictMonad);
        });
    };
};
var monadZeroExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeExceptT(dictMonoid)(dictMonad);
        }, function () {
            return monadExceptT(dictMonad);
        });
    };
};
var monadPlusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroExceptT(dictMonoid)(dictMonad);
        });
    };
};
module.exports = {
    ExceptT: ExceptT, 
    except: except, 
    mapExceptT: mapExceptT, 
    runExceptT: runExceptT, 
    withExceptT: withExceptT, 
    newtypeExceptT: newtypeExceptT, 
    functorExceptT: functorExceptT, 
    applyExceptT: applyExceptT, 
    applicativeExceptT: applicativeExceptT, 
    bindExceptT: bindExceptT, 
    monadExceptT: monadExceptT, 
    monadRecExceptT: monadRecExceptT, 
    altExceptT: altExceptT, 
    plusExceptT: plusExceptT, 
    alternativeExceptT: alternativeExceptT, 
    monadPlusExceptT: monadPlusExceptT, 
    monadZeroExceptT: monadZeroExceptT, 
    monadTransExceptT: monadTransExceptT, 
    monadEffExceptT: monadEffExceptT, 
    monadContExceptT: monadContExceptT, 
    monadThrowExceptT: monadThrowExceptT, 
    monadErrorExceptT: monadErrorExceptT, 
    monadAskExceptT: monadAskExceptT, 
    monadReaderExceptT: monadReaderExceptT, 
    monadStateExceptT: monadStateExceptT, 
    monadTellExceptT: monadTellExceptT, 
    monadWriterExceptT: monadWriterExceptT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans.Class":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Function":102,"../Data.Functor":107,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Semigroup":141,"../Data.Tuple":153,"../Prelude":168}],50:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Except_Trans = require("../Control.Monad.Except.Trans");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Identity = require("../Data.Identity");
var Data_Newtype = require("../Data.Newtype");
var Prelude = require("../Prelude");
var withExcept = Control_Monad_Except_Trans.withExceptT(Data_Identity.functorIdentity);
var runExcept = function ($0) {
    return Data_Newtype.unwrap(Data_Identity.newtypeIdentity)(Control_Monad_Except_Trans.runExceptT($0));
};
var mapExcept = function (f) {
    return Control_Monad_Except_Trans.mapExceptT(function ($1) {
        return Data_Identity.Identity(f(Data_Newtype.unwrap(Data_Identity.newtypeIdentity)($1)));
    });
};
module.exports = {
    mapExcept: mapExcept, 
    runExcept: runExcept, 
    withExcept: withExcept
};

},{"../Control.Monad.Error.Class":48,"../Control.Monad.Except.Trans":49,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Identity":112,"../Data.Newtype":131,"../Prelude":168}],51:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Newtype = require("../Data.Newtype");
var Data_Tuple = require("../Data.Tuple");
var Prelude = require("../Prelude");
var MaybeT = function (x) {
    return x;
};
var runMaybeT = function (v) {
    return v;
};
var newtypeMaybeT = new Data_Newtype.Newtype(function (n) {
    return n;
}, MaybeT);
var monadTransMaybeT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function ($71) {
        return MaybeT(Control_Monad.liftM1(dictMonad)(Data_Maybe.Just.create)($71));
    };
});
var mapMaybeT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorMaybeT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return Data_Functor.map(dictFunctor)(Data_Functor.map(Data_Maybe.functorMaybe)(f))(v);
        };
    });
};
var monadMaybeT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return bindMaybeT(dictMonad);
    });
};
var bindMaybeT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyMaybeT(dictMonad);
    }, function (v) {
        return function (f) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(function (v1) {
                if (v1 instanceof Data_Maybe.Nothing) {
                    return Control_Applicative.pure(dictMonad.Applicative0())(Data_Maybe.Nothing.value);
                };
                if (v1 instanceof Data_Maybe.Just) {
                    var v2 = f(v1.value0);
                    return v2;
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 55, column 11 - line 57, column 42: " + [ v1.constructor.name ]);
            });
        };
    });
};
var applyMaybeT = function (dictMonad) {
    return new Control_Apply.Apply(function () {
        return functorMaybeT(((dictMonad.Bind1()).Apply0()).Functor0());
    }, Control_Monad.ap(monadMaybeT(dictMonad)));
};
var applicativeMaybeT = function (dictMonad) {
    return new Control_Applicative.Applicative(function () {
        return applyMaybeT(dictMonad);
    }, function ($72) {
        return MaybeT(Control_Applicative.pure(dictMonad.Applicative0())(Data_Maybe.Just.create($72)));
    });
};
var monadAskMaybeT = function (dictMonadAsk) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadMaybeT(dictMonadAsk.Monad0());
    }, Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadAsk.Monad0())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
};
var monadReaderMaybeT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskMaybeT(dictMonadReader.MonadAsk0());
    }, function (f) {
        return mapMaybeT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadContMaybeT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadMaybeT(dictMonadCont.Monad0());
    }, function (f) {
        return MaybeT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var v = f(function (a) {
                return MaybeT(c(new Data_Maybe.Just(a)));
            });
            return v;
        }));
    });
};
var monadEffMaybe = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadMaybeT(dictMonadEff.Monad0());
    }, function ($73) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadEff.Monad0())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($73));
    });
};
var monadRecMaybeT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadMaybeT(dictMonadRec.Monad0());
    }, function (f) {
        return function ($74) {
            return MaybeT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                return Control_Bind.bind((dictMonadRec.Monad0()).Bind1())((function () {
                    var v = f(a);
                    return v;
                })())(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0())((function () {
                        if (m$prime instanceof Data_Maybe.Nothing) {
                            return new Control_Monad_Rec_Class.Done(Data_Maybe.Nothing.value);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Control_Monad_Rec_Class.Loop) {
                            return new Control_Monad_Rec_Class.Loop(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Control_Monad_Rec_Class.Done) {
                            return new Control_Monad_Rec_Class.Done(new Data_Maybe.Just(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 85, column 16 - line 88, column 43: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($74));
        };
    });
};
var monadStateMaybeT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadMaybeT(dictMonadState.Monad0());
    }, function (f) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadState.Monad0())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadTellMaybeT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadMaybeT(dictMonadTell.Monad0());
    }, function ($75) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadTell.Monad0())(Control_Monad_Writer_Class.tell(dictMonadTell)($75));
    });
};
var monadWriterMaybeT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellMaybeT(dictMonadWriter.MonadTell0());
    }, mapMaybeT(function (m) {
        return Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())(Data_Functor.map(Data_Maybe.functorMaybe)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapMaybeT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(m)(function (v) {
            return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())((function () {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Tuple.Tuple(Data_Maybe.Nothing.value, Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Tuple.Tuple(new Data_Maybe.Just(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 122, column 10 - line 124, column 42: " + [ v.constructor.name ]);
            })());
        }));
    }));
};
var monadThrowMaybeT = function (dictMonadThrow) {
    return new Control_Monad_Error_Class.MonadThrow(function () {
        return monadMaybeT(dictMonadThrow.Monad0());
    }, function (e) {
        return Control_Monad_Trans_Class.lift(monadTransMaybeT)(dictMonadThrow.Monad0())(Control_Monad_Error_Class.throwError(dictMonadThrow)(e));
    });
};
var monadErrorMaybeT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadThrowMaybeT(dictMonadError.MonadThrow0());
    }, function (v) {
        return function (h) {
            return MaybeT(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (a) {
                var v1 = h(a);
                return v1;
            }));
        };
    });
};
var altMaybeT = function (dictMonad) {
    return new Control_Alt.Alt(function () {
        return functorMaybeT(((dictMonad.Bind1()).Apply0()).Functor0());
    }, function (v) {
        return function (v1) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(function (v2) {
                if (v2 instanceof Data_Maybe.Nothing) {
                    return v1;
                };
                return Control_Applicative.pure(dictMonad.Applicative0())(v2);
            });
        };
    });
};
var plusMaybeT = function (dictMonad) {
    return new Control_Plus.Plus(function () {
        return altMaybeT(dictMonad);
    }, Control_Applicative.pure(dictMonad.Applicative0())(Data_Maybe.Nothing.value));
};
var alternativeMaybeT = function (dictMonad) {
    return new Control_Alternative.Alternative(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return plusMaybeT(dictMonad);
    });
};
var monadZeroMaybeT = function (dictMonad) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeMaybeT(dictMonad);
    }, function () {
        return monadMaybeT(dictMonad);
    });
};
var monadPlusMaybeT = function (dictMonad) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroMaybeT(dictMonad);
    });
};
module.exports = {
    MaybeT: MaybeT, 
    mapMaybeT: mapMaybeT, 
    runMaybeT: runMaybeT, 
    newtypeMaybeT: newtypeMaybeT, 
    functorMaybeT: functorMaybeT, 
    applyMaybeT: applyMaybeT, 
    applicativeMaybeT: applicativeMaybeT, 
    bindMaybeT: bindMaybeT, 
    monadMaybeT: monadMaybeT, 
    monadTransMaybeT: monadTransMaybeT, 
    altMaybeT: altMaybeT, 
    plusMaybeT: plusMaybeT, 
    alternativeMaybeT: alternativeMaybeT, 
    monadPlusMaybeT: monadPlusMaybeT, 
    monadZeroMaybeT: monadZeroMaybeT, 
    monadRecMaybeT: monadRecMaybeT, 
    monadEffMaybe: monadEffMaybe, 
    monadContMaybeT: monadContMaybeT, 
    monadThrowMaybeT: monadThrowMaybeT, 
    monadErrorMaybeT: monadErrorMaybeT, 
    monadAskMaybeT: monadAskMaybeT, 
    monadReaderMaybeT: monadReaderMaybeT, 
    monadStateMaybeT: monadStateMaybeT, 
    monadTellMaybeT: monadTellMaybeT, 
    monadWriterMaybeT: monadWriterMaybeT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans.Class":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Newtype":131,"../Data.Tuple":153,"../Prelude":168}],52:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Functor = require("../Data.Functor");
var Prelude = require("../Prelude");
var MonadAsk = function (Monad0, ask) {
    this.Monad0 = Monad0;
    this.ask = ask;
};
var MonadReader = function (MonadAsk0, local) {
    this.MonadAsk0 = MonadAsk0;
    this.local = local;
};
var monadAskFun = new MonadAsk(function () {
    return Control_Monad.monadFn;
}, Control_Category.id(Control_Category.categoryFn));
var monadReaderFun = new MonadReader(function () {
    return monadAskFun;
}, Control_Semigroupoid.composeFlipped(Control_Semigroupoid.semigroupoidFn));
var local = function (dict) {
    return dict.local;
};
var ask = function (dict) {
    return dict.ask;
};
var asks = function (dictMonadAsk) {
    return function (f) {
        return Data_Functor.map((((dictMonadAsk.Monad0()).Bind1()).Apply0()).Functor0())(f)(ask(dictMonadAsk));
    };
};
module.exports = {
    MonadAsk: MonadAsk, 
    MonadReader: MonadReader, 
    ask: ask, 
    asks: asks, 
    local: local, 
    monadAskFun: monadAskFun, 
    monadReaderFun: monadReaderFun
};

},{"../Control.Category":21,"../Control.Monad":61,"../Control.Semigroupoid":67,"../Data.Functor":107,"../Prelude":168}],53:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Distributive = require("../Data.Distributive");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Prelude = require("../Prelude");
var ReaderT = function (x) {
    return x;
};
var withReaderT = function (f) {
    return function (v) {
        return function ($58) {
            return v(f($58));
        };
    };
};
var runReaderT = function (v) {
    return v;
};
var newtypeReaderT = new Data_Newtype.Newtype(function (n) {
    return n;
}, ReaderT);
var monadTransReaderT = new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
    return function ($59) {
        return ReaderT(Data_Function["const"]($59));
    };
});
var mapReaderT = function (f) {
    return function (v) {
        return function ($60) {
            return f(v($60));
        };
    };
};
var functorReaderT = function (dictFunctor) {
    return new Data_Functor.Functor(function ($61) {
        return mapReaderT(Data_Functor.map(dictFunctor)($61));
    });
};
var distributiveReaderT = function (dictDistributive) {
    return new Data_Distributive.Distributive(function () {
        return functorReaderT(dictDistributive.Functor0());
    }, function (dictFunctor) {
        return function (f) {
            return function ($62) {
                return Data_Distributive.distribute(distributiveReaderT(dictDistributive))(dictFunctor)(Data_Functor.map(dictFunctor)(f)($62));
            };
        };
    }, function (dictFunctor) {
        return function (a) {
            return function (e) {
                return Data_Distributive.collect(dictDistributive)(dictFunctor)(function (r) {
                    return r(e);
                })(a);
            };
        };
    });
};
var applyReaderT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorReaderT(dictApply.Functor0());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Apply.apply(dictApply)(v(r))(v1(r));
            };
        };
    });
};
var bindReaderT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyReaderT(dictBind.Apply0());
    }, function (v) {
        return function (k) {
            return function (r) {
                return Control_Bind.bind(dictBind)(v(r))(function (a) {
                    var v1 = k(a);
                    return v1(r);
                });
            };
        };
    });
};
var applicativeReaderT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyReaderT(dictApplicative.Apply0());
    }, function ($63) {
        return ReaderT(Data_Function["const"](Control_Applicative.pure(dictApplicative)($63)));
    });
};
var monadReaderT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeReaderT(dictMonad.Applicative0());
    }, function () {
        return bindReaderT(dictMonad.Bind1());
    });
};
var monadAskReaderT = function (dictMonad) {
    return new Control_Monad_Reader_Class.MonadAsk(function () {
        return monadReaderT(dictMonad);
    }, Control_Applicative.pure(dictMonad.Applicative0()));
};
var monadReaderReaderT = function (dictMonad) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadAskReaderT(dictMonad);
    }, withReaderT);
};
var monadContReaderT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadReaderT(dictMonadCont.Monad0());
    }, function (f) {
        return function (r) {
            return Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var v = f(function ($64) {
                    return ReaderT(Data_Function["const"](c($64)));
                });
                return v(r);
            });
        };
    });
};
var monadEffReader = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadReaderT(dictMonadEff.Monad0());
    }, function ($65) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadEff.Monad0())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($65));
    });
};
var monadRecReaderT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadReaderT(dictMonadRec.Monad0());
    }, function (k) {
        return function (a) {
            var k$prime = function (r) {
                return function (a$prime) {
                    var v = k(a$prime);
                    return Control_Bind.bindFlipped((dictMonadRec.Monad0()).Bind1())(Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0()))(v(r));
                };
            };
            return function (r) {
                return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(k$prime(r))(a);
            };
        };
    });
};
var monadStateReaderT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadReaderT(dictMonadState.Monad0());
    }, function ($66) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadState.Monad0())(Control_Monad_State_Class.state(dictMonadState)($66));
    });
};
var monadTellReaderT = function (dictMonadTell) {
    return new Control_Monad_Writer_Class.MonadTell(function () {
        return monadReaderT(dictMonadTell.Monad0());
    }, function ($67) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadTell.Monad0())(Control_Monad_Writer_Class.tell(dictMonadTell)($67));
    });
};
var monadWriterReaderT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadTellReaderT(dictMonadWriter.MonadTell0());
    }, mapReaderT(Control_Monad_Writer_Class.listen(dictMonadWriter)), mapReaderT(Control_Monad_Writer_Class.pass(dictMonadWriter)));
};
var monadThrowReaderT = function (dictMonadThrow) {
    return new Control_Monad_Error_Class.MonadThrow(function () {
        return monadReaderT(dictMonadThrow.Monad0());
    }, function ($68) {
        return Control_Monad_Trans_Class.lift(monadTransReaderT)(dictMonadThrow.Monad0())(Control_Monad_Error_Class.throwError(dictMonadThrow)($68));
    });
};
var monadErrorReaderT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadThrowReaderT(dictMonadError.MonadThrow0());
    }, function (v) {
        return function (h) {
            return function (r) {
                return Control_Monad_Error_Class.catchError(dictMonadError)(v(r))(function (e) {
                    var v1 = h(e);
                    return v1(r);
                });
            };
        };
    });
};
var altReaderT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorReaderT(dictAlt.Functor0());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Alt.alt(dictAlt)(v(r))(v1(r));
            };
        };
    });
};
var plusReaderT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altReaderT(dictPlus.Alt0());
    }, Data_Function["const"](Control_Plus.empty(dictPlus)));
};
var alternativeReaderT = function (dictAlternative) {
    return new Control_Alternative.Alternative(function () {
        return applicativeReaderT(dictAlternative.Applicative0());
    }, function () {
        return plusReaderT(dictAlternative.Plus1());
    });
};
var monadZeroReaderT = function (dictMonadZero) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeReaderT(dictMonadZero.Alternative1());
    }, function () {
        return monadReaderT(dictMonadZero.Monad0());
    });
};
var monadPlusReaderT = function (dictMonadPlus) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroReaderT(dictMonadPlus.MonadZero0());
    });
};
module.exports = {
    ReaderT: ReaderT, 
    mapReaderT: mapReaderT, 
    runReaderT: runReaderT, 
    withReaderT: withReaderT, 
    newtypeReaderT: newtypeReaderT, 
    functorReaderT: functorReaderT, 
    applyReaderT: applyReaderT, 
    applicativeReaderT: applicativeReaderT, 
    altReaderT: altReaderT, 
    plusReaderT: plusReaderT, 
    alternativeReaderT: alternativeReaderT, 
    bindReaderT: bindReaderT, 
    monadReaderT: monadReaderT, 
    monadZeroReaderT: monadZeroReaderT, 
    monadPlusReaderT: monadPlusReaderT, 
    monadTransReaderT: monadTransReaderT, 
    monadEffReader: monadEffReader, 
    monadContReaderT: monadContReaderT, 
    monadThrowReaderT: monadThrowReaderT, 
    monadErrorReaderT: monadErrorReaderT, 
    monadAskReaderT: monadAskReaderT, 
    monadReaderReaderT: monadReaderReaderT, 
    monadStateReaderT: monadStateReaderT, 
    monadTellReaderT: monadTellReaderT, 
    monadWriterReaderT: monadWriterReaderT, 
    distributiveReaderT: distributiveReaderT, 
    monadRecReaderT: monadRecReaderT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans.Class":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Distributive":89,"../Data.Function":102,"../Data.Functor":107,"../Data.Newtype":131,"../Prelude":168}],54:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_ST = require("../Control.Monad.ST");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Either = require("../Data.Either");
var Data_Functor = require("../Data.Functor");
var Data_Identity = require("../Data.Identity");
var Data_Unit = require("../Data.Unit");
var Partial_Unsafe = require("../Partial.Unsafe");
var Prelude = require("../Prelude");
var Loop = (function () {
    function Loop(value0) {
        this.value0 = value0;
    };
    Loop.create = function (value0) {
        return new Loop(value0);
    };
    return Loop;
})();
var Done = (function () {
    function Done(value0) {
        this.value0 = value0;
    };
    Done.create = function (value0) {
        return new Done(value0);
    };
    return Done;
})();
var MonadRec = function (Monad0, tailRecM) {
    this.Monad0 = Monad0;
    this.tailRecM = tailRecM;
};
var tailRecM = function (dict) {
    return dict.tailRecM;
};
var tailRecM2 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return tailRecM(dictMonadRec)(function (o) {
                    return f(o.a)(o.b);
                })({
                    a: a, 
                    b: b
                });
            };
        };
    };
};
var tailRecM3 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return tailRecM(dictMonadRec)(function (o) {
                        return f(o.a)(o.b)(o.c);
                    })({
                        a: a, 
                        b: b, 
                        c: c
                    });
                };
            };
        };
    };
};
var tailRecEff = function (f) {
    return function (a) {
        var fromDone = function (v) {
            var __unused = function (dictPartial1) {
                return function ($dollar16) {
                    return $dollar16;
                };
            };
            return __unused()((function () {
                if (v instanceof Done) {
                    return v.value0;
                };
                throw new Error("Failed pattern match at Control.Monad.Rec.Class line 130, column 28 - line 130, column 42: " + [ v.constructor.name ]);
            })());
        };
        var f$prime = function ($48) {
            return Control_Monad_Eff_Unsafe.unsafeCoerceEff(f($48));
        };
        return function __do() {
            var v = f$prime(a)();
            var v1 = {
                value: v
            };
            (function () {
                while (!(function __do() {
                    var v2 = v1.value;
                    if (v2 instanceof Loop) {
                        var v3 = f$prime(v2.value0)();
                        var v4 = v1.value = v3;
                        return false;
                    };
                    if (v2 instanceof Done) {
                        return true;
                    };
                    throw new Error("Failed pattern match at Control.Monad.Rec.Class line 119, column 5 - line 124, column 26: " + [ v2.constructor.name ]);
                })()) {

                };
                return {};
            })();
            return Data_Functor.map(Control_Monad_Eff.functorEff)(fromDone)(Control_Monad_ST.readSTRef(v1))();
        };
    };
};
var tailRec = function (f) {
    var go = function (__copy_v) {
        var v = __copy_v;
        var __tco_done = false;
        var __tco_result;
        var __tco_v;
        function __tco_loop(v) {
            if (v instanceof Loop) {
                __tco_v = f(v.value0);
                return;
            };
            if (v instanceof Done) {
                __tco_done = true;
                return v.value0;
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 93, column 13 - line 96, column 18: " + [ v.constructor.name ]);
        };
        while (!__tco_done) {
            __tco_result = __tco_loop(v);
            v = __tco_v;
        };
        return __tco_result;
    };
    return function ($49) {
        return go(f($49));
    };
};
var monadRecIdentity = new MonadRec(function () {
    return Data_Identity.monadIdentity;
}, function (f) {
    var runIdentity = function (v) {
        return v;
    };
    return function ($50) {
        return Data_Identity.Identity(tailRec(function ($51) {
            return runIdentity(f($51));
        })($50));
    };
});
var monadRecEither = new MonadRec(function () {
    return Data_Either.monadEither;
}, function (f) {
    return function (a0) {
        var g = function (v) {
            if (v instanceof Data_Either.Left) {
                return new Done(new Data_Either.Left(v.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Loop) {
                return new Loop(f(v.value0.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Done) {
                return new Done(new Data_Either.Right(v.value0.value0));
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 108, column 7 - line 108, column 33: " + [ v.constructor.name ]);
        };
        return tailRec(g)(f(a0));
    };
});
var monadRecEff = new MonadRec(function () {
    return Control_Monad_Eff.monadEff;
}, tailRecEff);
var functorStep = new Data_Functor.Functor(function (f) {
    return function (v) {
        if (v instanceof Loop) {
            return new Loop(v.value0);
        };
        if (v instanceof Done) {
            return new Done(f(v.value0));
        };
        throw new Error("Failed pattern match at Control.Monad.Rec.Class line 28, column 3 - line 28, column 26: " + [ f.constructor.name, v.constructor.name ]);
    };
});
var forever = function (dictMonadRec) {
    return function (ma) {
        return tailRecM(dictMonadRec)(function (u) {
            return Data_Functor.voidRight((((dictMonadRec.Monad0()).Bind1()).Apply0()).Functor0())(new Loop(u))(ma);
        })(Data_Unit.unit);
    };
};
var bifunctorStep = new Data_Bifunctor.Bifunctor(function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Loop) {
                return new Loop(v(v2.value0));
            };
            if (v2 instanceof Done) {
                return new Done(v1(v2.value0));
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 32, column 3 - line 32, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
});
module.exports = {
    Loop: Loop, 
    Done: Done, 
    MonadRec: MonadRec, 
    forever: forever, 
    tailRec: tailRec, 
    tailRecM: tailRecM, 
    tailRecM2: tailRecM2, 
    tailRecM3: tailRecM3, 
    functorStep: functorStep, 
    bifunctorStep: bifunctorStep, 
    monadRecIdentity: monadRecIdentity, 
    monadRecEff: monadRecEff, 
    monadRecEither: monadRecEither
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Unsafe":45,"../Control.Monad.ST":56,"../Control.Semigroupoid":67,"../Data.Bifunctor":82,"../Data.Either":90,"../Data.Functor":107,"../Data.Identity":112,"../Data.Unit":157,"../Partial.Unsafe":165,"../Prelude":168}],55:[function(require,module,exports){
"use strict";

exports.newSTRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readSTRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports.modifySTRef = function (ref) {
  return function (f) {
    return function () {
      return ref.value = f(ref.value); // eslint-disable-line no-return-assign
    };
  };
};

exports.writeSTRef = function (ref) {
  return function (a) {
    return function () {
      return ref.value = a; // eslint-disable-line no-return-assign
    };
  };
};

exports.runST = function (f) {
  return f;
};

},{}],56:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var pureST = function (st) {
    return Control_Monad_Eff.runPure($foreign.runST(st));
};
module.exports = {
    pureST: pureST, 
    modifySTRef: $foreign.modifySTRef, 
    newSTRef: $foreign.newSTRef, 
    readSTRef: $foreign.readSTRef, 
    runST: $foreign.runST, 
    writeSTRef: $foreign.writeSTRef
};

},{"../Control.Monad.Eff":47,"./foreign":55}],57:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var MonadState = function (Monad0, state) {
    this.Monad0 = Monad0;
    this.state = state;
};
var state = function (dict) {
    return dict.state;
};
var put = function (dictMonadState) {
    return function (s) {
        return state(dictMonadState)(function (v) {
            return new Data_Tuple.Tuple(Data_Unit.unit, s);
        });
    };
};
var modify = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(Data_Unit.unit, f(s));
        });
    };
};
var gets = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(f(s), s);
        });
    };
};
var get = function (dictMonadState) {
    return state(dictMonadState)(function (s) {
        return new Data_Tuple.Tuple(s, s);
    });
};
module.exports = {
    MonadState: MonadState, 
    get: get, 
    gets: gets, 
    modify: modify, 
    put: put, 
    state: state
};

},{"../Data.Tuple":153,"../Data.Unit":157,"../Prelude":168}],58:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Prelude = require("../Prelude");
var MonadTrans = function (lift) {
    this.lift = lift;
};
var lift = function (dict) {
    return dict.lift;
};
module.exports = {
    MonadTrans: MonadTrans, 
    lift: lift
};

},{"../Prelude":168}],59:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Data_Tuple = require("../Data.Tuple");
var Prelude = require("../Prelude");
var MonadTell = function (Monad0, tell) {
    this.Monad0 = Monad0;
    this.tell = tell;
};
var MonadWriter = function (MonadTell0, listen, pass) {
    this.MonadTell0 = MonadTell0;
    this.listen = listen;
    this.pass = pass;
};
var tell = function (dict) {
    return dict.tell;
};
var pass = function (dict) {
    return dict.pass;
};
var listen = function (dict) {
    return dict.listen;
};
var listens = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(listen(dictMonadWriter)(m))(function (v) {
                return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())(new Data_Tuple.Tuple(v.value0, f(v.value1)));
            });
        };
    };
};
var censor = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return pass(dictMonadWriter)(Control_Bind.bind(((dictMonadWriter.MonadTell0()).Monad0()).Bind1())(m)(function (v) {
                return Control_Applicative.pure(((dictMonadWriter.MonadTell0()).Monad0()).Applicative0())(new Data_Tuple.Tuple(v, f));
            }));
        };
    };
};
module.exports = {
    MonadTell: MonadTell, 
    MonadWriter: MonadWriter, 
    censor: censor, 
    listen: listen, 
    listens: listens, 
    pass: pass, 
    tell: tell
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Data.Function":102,"../Data.Tuple":153,"../Prelude":168}],60:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans_Class = require("../Control.Monad.Trans.Class");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var WriterT = function (x) {
    return x;
};
var runWriterT = function (v) {
    return v;
};
var newtypeWriterT = new Data_Newtype.Newtype(function (n) {
    return n;
}, WriterT);
var monadTransWriterT = function (dictMonoid) {
    return new Control_Monad_Trans_Class.MonadTrans(function (dictMonad) {
        return function (m) {
            return Control_Bind.bind(dictMonad.Bind1())(m)(function (v) {
                return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Tuple.Tuple(v, Data_Monoid.mempty(dictMonoid)));
            });
        };
    });
};
var mapWriterT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorWriterT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return mapWriterT(Data_Functor.map(dictFunctor)(function (v) {
            return new Data_Tuple.Tuple(f(v.value0), v.value1);
        }));
    });
};
var execWriterT = function (dictFunctor) {
    return function (v) {
        return Data_Functor.map(dictFunctor)(Data_Tuple.snd)(v);
    };
};
var applyWriterT = function (dictSemigroup) {
    return function (dictApply) {
        return new Control_Apply.Apply(function () {
            return functorWriterT(dictApply.Functor0());
        }, function (v) {
            return function (v1) {
                var k = function (v3) {
                    return function (v4) {
                        return new Data_Tuple.Tuple(v3.value0(v4.value0), Data_Semigroup.append(dictSemigroup)(v3.value1)(v4.value1));
                    };
                };
                return Control_Apply.apply(dictApply)(Data_Functor.map(dictApply.Functor0())(k)(v))(v1);
            };
        });
    };
};
var bindWriterT = function (dictSemigroup) {
    return function (dictBind) {
        return new Control_Bind.Bind(function () {
            return applyWriterT(dictSemigroup)(dictBind.Apply0());
        }, function (v) {
            return function (k) {
                return WriterT(Control_Bind.bind(dictBind)(v)(function (v1) {
                    var v2 = k(v1.value0);
                    return Data_Functor.map((dictBind.Apply0()).Functor0())(function (v3) {
                        return new Data_Tuple.Tuple(v3.value0, Data_Semigroup.append(dictSemigroup)(v1.value1)(v3.value1));
                    })(v2);
                }));
            };
        });
    };
};
var applicativeWriterT = function (dictMonoid) {
    return function (dictApplicative) {
        return new Control_Applicative.Applicative(function () {
            return applyWriterT(dictMonoid.Semigroup0())(dictApplicative.Apply0());
        }, function (a) {
            return WriterT(Control_Applicative.pure(dictApplicative)(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
        });
    };
};
var monadWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad.Monad(function () {
            return applicativeWriterT(dictMonoid)(dictMonad.Applicative0());
        }, function () {
            return bindWriterT(dictMonoid.Semigroup0())(dictMonad.Bind1());
        });
    };
};
var monadAskWriterT = function (dictMonoid) {
    return function (dictMonadAsk) {
        return new Control_Monad_Reader_Class.MonadAsk(function () {
            return monadWriterT(dictMonoid)(dictMonadAsk.Monad0());
        }, Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadAsk.Monad0())(Control_Monad_Reader_Class.ask(dictMonadAsk)));
    };
};
var monadReaderWriterT = function (dictMonoid) {
    return function (dictMonadReader) {
        return new Control_Monad_Reader_Class.MonadReader(function () {
            return monadAskWriterT(dictMonoid)(dictMonadReader.MonadAsk0());
        }, function (f) {
            return mapWriterT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
        });
    };
};
var monadContWriterT = function (dictMonoid) {
    return function (dictMonadCont) {
        return new Control_Monad_Cont_Class.MonadCont(function () {
            return monadWriterT(dictMonoid)(dictMonadCont.Monad0());
        }, function (f) {
            return WriterT(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var v = f(function (a) {
                    return WriterT(c(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
                });
                return v;
            }));
        });
    };
};
var monadEffWriter = function (dictMonoid) {
    return function (dictMonadEff) {
        return new Control_Monad_Eff_Class.MonadEff(function () {
            return monadWriterT(dictMonoid)(dictMonadEff.Monad0());
        }, function ($119) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadEff.Monad0())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($119));
        });
    };
};
var monadRecWriterT = function (dictMonoid) {
    return function (dictMonadRec) {
        return new Control_Monad_Rec_Class.MonadRec(function () {
            return monadWriterT(dictMonoid)(dictMonadRec.Monad0());
        }, function (f) {
            return function (a) {
                var f$prime = function (v) {
                    return Control_Bind.bind((dictMonadRec.Monad0()).Bind1())((function () {
                        var v1 = f(v.value0);
                        return v1;
                    })())(function (v1) {
                        return Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0())((function () {
                            if (v1.value0 instanceof Control_Monad_Rec_Class.Loop) {
                                return new Control_Monad_Rec_Class.Loop(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid.Semigroup0())(v.value1)(v1.value1)));
                            };
                            if (v1.value0 instanceof Control_Monad_Rec_Class.Done) {
                                return new Control_Monad_Rec_Class.Done(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid.Semigroup0())(v.value1)(v1.value1)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Writer.Trans line 85, column 16 - line 87, column 47: " + [ v1.value0.constructor.name ]);
                        })());
                    });
                };
                return WriterT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(f$prime)(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
            };
        });
    };
};
var monadStateWriterT = function (dictMonoid) {
    return function (dictMonadState) {
        return new Control_Monad_State_Class.MonadState(function () {
            return monadWriterT(dictMonoid)(dictMonadState.Monad0());
        }, function (f) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadState.Monad0())(Control_Monad_State_Class.state(dictMonadState)(f));
        });
    };
};
var monadTellWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad_Writer_Class.MonadTell(function () {
            return monadWriterT(dictMonoid)(dictMonad);
        }, function ($120) {
            return WriterT(Control_Applicative.pure(dictMonad.Applicative0())(Data_Tuple.Tuple.create(Data_Unit.unit)($120)));
        });
    };
};
var monadWriterWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad_Writer_Class.MonadWriter(function () {
            return monadTellWriterT(dictMonoid)(dictMonad);
        }, function (v) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(function (v1) {
                return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Tuple.Tuple(new Data_Tuple.Tuple(v1.value0, v1.value1), v1.value1));
            });
        }, function (v) {
            return Control_Bind.bind(dictMonad.Bind1())(v)(function (v1) {
                return Control_Applicative.pure(dictMonad.Applicative0())(new Data_Tuple.Tuple(v1.value0.value0, v1.value0.value1(v1.value1)));
            });
        });
    };
};
var monadThrowWriterT = function (dictMonoid) {
    return function (dictMonadThrow) {
        return new Control_Monad_Error_Class.MonadThrow(function () {
            return monadWriterT(dictMonoid)(dictMonadThrow.Monad0());
        }, function (e) {
            return Control_Monad_Trans_Class.lift(monadTransWriterT(dictMonoid))(dictMonadThrow.Monad0())(Control_Monad_Error_Class.throwError(dictMonadThrow)(e));
        });
    };
};
var monadErrorWriterT = function (dictMonoid) {
    return function (dictMonadError) {
        return new Control_Monad_Error_Class.MonadError(function () {
            return monadThrowWriterT(dictMonoid)(dictMonadError.MonadThrow0());
        }, function (v) {
            return function (h) {
                return WriterT(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (e) {
                    var v1 = h(e);
                    return v1;
                }));
            };
        });
    };
};
var altWriterT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorWriterT(dictAlt.Functor0());
    }, function (v) {
        return function (v1) {
            return Control_Alt.alt(dictAlt)(v)(v1);
        };
    });
};
var plusWriterT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altWriterT(dictPlus.Alt0());
    }, Control_Plus.empty(dictPlus));
};
var alternativeWriterT = function (dictMonoid) {
    return function (dictAlternative) {
        return new Control_Alternative.Alternative(function () {
            return applicativeWriterT(dictMonoid)(dictAlternative.Applicative0());
        }, function () {
            return plusWriterT(dictAlternative.Plus1());
        });
    };
};
var monadZeroWriterT = function (dictMonoid) {
    return function (dictMonadZero) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeWriterT(dictMonoid)(dictMonadZero.Alternative1());
        }, function () {
            return monadWriterT(dictMonoid)(dictMonadZero.Monad0());
        });
    };
};
var monadPlusWriterT = function (dictMonoid) {
    return function (dictMonadPlus) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroWriterT(dictMonoid)(dictMonadPlus.MonadZero0());
        });
    };
};
module.exports = {
    WriterT: WriterT, 
    execWriterT: execWriterT, 
    mapWriterT: mapWriterT, 
    runWriterT: runWriterT, 
    newtypeWriterT: newtypeWriterT, 
    functorWriterT: functorWriterT, 
    applyWriterT: applyWriterT, 
    applicativeWriterT: applicativeWriterT, 
    altWriterT: altWriterT, 
    plusWriterT: plusWriterT, 
    alternativeWriterT: alternativeWriterT, 
    bindWriterT: bindWriterT, 
    monadWriterT: monadWriterT, 
    monadRecWriterT: monadRecWriterT, 
    monadZeroWriterT: monadZeroWriterT, 
    monadPlusWriterT: monadPlusWriterT, 
    monadTransWriterT: monadTransWriterT, 
    monadEffWriter: monadEffWriter, 
    monadContWriterT: monadContWriterT, 
    monadThrowWriterT: monadThrowWriterT, 
    monadErrorWriterT: monadErrorWriterT, 
    monadAskWriterT: monadAskWriterT, 
    monadReaderWriterT: monadReaderWriterT, 
    monadStateWriterT: monadStateWriterT, 
    monadTellWriterT: monadTellWriterT, 
    monadWriterWriterT: monadWriterWriterT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans.Class":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Functor":107,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Semigroup":141,"../Data.Tuple":153,"../Data.Unit":157,"../Prelude":168}],61:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Monad = function (Applicative0, Bind1) {
    this.Applicative0 = Applicative0;
    this.Bind1 = Bind1;
};
var whenM = function (dictMonad) {
    return function (mb) {
        return function (m) {
            return Control_Bind.bind(dictMonad.Bind1())(mb)(function (v) {
                return Control_Applicative.when(dictMonad.Applicative0())(v)(m);
            });
        };
    };
};
var unlessM = function (dictMonad) {
    return function (mb) {
        return function (m) {
            return Control_Bind.bind(dictMonad.Bind1())(mb)(function (v) {
                return Control_Applicative.unless(dictMonad.Applicative0())(v)(m);
            });
        };
    };
};
var monadFn = new Monad(function () {
    return Control_Applicative.applicativeFn;
}, function () {
    return Control_Bind.bindFn;
});
var monadArray = new Monad(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Bind.bindArray;
});
var liftM1 = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad.Bind1())(a)(function (v) {
                return Control_Applicative.pure(dictMonad.Applicative0())(f(v));
            });
        };
    };
};
var ap = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad.Bind1())(f)(function (v) {
                return Control_Bind.bind(dictMonad.Bind1())(a)(function (v1) {
                    return Control_Applicative.pure(dictMonad.Applicative0())(v(v1));
                });
            });
        };
    };
};
module.exports = {
    Monad: Monad, 
    ap: ap, 
    liftM1: liftM1, 
    unlessM: unlessM, 
    whenM: whenM, 
    monadFn: monadFn, 
    monadArray: monadArray
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Data.Functor":107,"../Data.Unit":157}],62:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var MonadPlus = function (MonadZero0) {
    this.MonadZero0 = MonadZero0;
};
var monadPlusArray = new MonadPlus(function () {
    return Control_MonadZero.monadZeroArray;
});
module.exports = {
    MonadPlus: MonadPlus, 
    monadPlusArray: monadPlusArray
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.MonadZero":63,"../Control.Plus":66,"../Data.Functor":107}],63:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var MonadZero = function (Alternative1, Monad0) {
    this.Alternative1 = Alternative1;
    this.Monad0 = Monad0;
};
var monadZeroArray = new MonadZero(function () {
    return Control_Alternative.alternativeArray;
}, function () {
    return Control_Monad.monadArray;
});
var guard = function (dictMonadZero) {
    return function (v) {
        if (v) {
            return Control_Applicative.pure((dictMonadZero.Alternative1()).Applicative0())(Data_Unit.unit);
        };
        if (!v) {
            return Control_Plus.empty((dictMonadZero.Alternative1()).Plus1());
        };
        throw new Error("Failed pattern match at Control.MonadZero line 55, column 1 - line 55, column 23: " + [ v.constructor.name ]);
    };
};
module.exports = {
    MonadZero: MonadZero, 
    guard: guard, 
    monadZeroArray: monadZeroArray
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Plus":66,"../Data.Functor":107,"../Data.Unit":157}],64:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad_Cont_Trans = require("../Control.Monad.Cont.Trans");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_Except_Trans = require("../Control.Monad.Except.Trans");
var Control_Monad_Maybe_Trans = require("../Control.Monad.Maybe.Trans");
var Control_Monad_Reader_Trans = require("../Control.Monad.Reader.Trans");
var Control_Monad_Writer_Trans = require("../Control.Monad.Writer.Trans");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Compose = require("../Data.Functor.Compose");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var ParCont = function (x) {
    return x;
};
var Parallel = function (Applicative1, Monad0, parallel, sequential) {
    this.Applicative1 = Applicative1;
    this.Monad0 = Monad0;
    this.parallel = parallel;
    this.sequential = sequential;
};
var unsafeWithRef = Control_Monad_Eff_Unsafe.unsafeCoerceEff;
var sequential = function (dict) {
    return dict.sequential;
};
var parallel = function (dict) {
    return dict.parallel;
};
var newtypeParCont = new Data_Newtype.Newtype(function (n) {
    return n;
}, ParCont);
var monadParWriterT = function (dictMonoid) {
    return function (dictParallel) {
        return new Parallel(function () {
            return Control_Monad_Writer_Trans.applicativeWriterT(dictMonoid)(dictParallel.Applicative1());
        }, function () {
            return Control_Monad_Writer_Trans.monadWriterT(dictMonoid)(dictParallel.Monad0());
        }, Control_Monad_Writer_Trans.mapWriterT(parallel(dictParallel)), Control_Monad_Writer_Trans.mapWriterT(sequential(dictParallel)));
    };
};
var monadParReaderT = function (dictParallel) {
    return new Parallel(function () {
        return Control_Monad_Reader_Trans.applicativeReaderT(dictParallel.Applicative1());
    }, function () {
        return Control_Monad_Reader_Trans.monadReaderT(dictParallel.Monad0());
    }, Control_Monad_Reader_Trans.mapReaderT(parallel(dictParallel)), Control_Monad_Reader_Trans.mapReaderT(sequential(dictParallel)));
};
var monadParMaybeT = function (dictParallel) {
    return new Parallel(function () {
        return Data_Functor_Compose.applicativeCompose(dictParallel.Applicative1())(Data_Maybe.applicativeMaybe);
    }, function () {
        return Control_Monad_Maybe_Trans.monadMaybeT(dictParallel.Monad0());
    }, function (v) {
        return parallel(dictParallel)(v);
    }, function (v) {
        return sequential(dictParallel)(v);
    });
};
var monadParExceptT = function (dictParallel) {
    return new Parallel(function () {
        return Data_Functor_Compose.applicativeCompose(dictParallel.Applicative1())(Data_Either.applicativeEither);
    }, function () {
        return Control_Monad_Except_Trans.monadExceptT(dictParallel.Monad0());
    }, function (v) {
        return parallel(dictParallel)(v);
    }, function (v) {
        return sequential(dictParallel)(v);
    });
};
var monadParParCont = function (dictMonadEff) {
    return new Parallel(function () {
        return applicativeParCont(dictMonadEff);
    }, function () {
        return Control_Monad_Cont_Trans.monadContT(dictMonadEff.Monad0());
    }, ParCont, function (v) {
        return v;
    });
};
var functorParCont = function (dictMonadEff) {
    return new Data_Functor.Functor(function (f) {
        return function ($55) {
            return parallel(monadParParCont(dictMonadEff))(Data_Functor.map(Control_Monad_Cont_Trans.functorContT((((dictMonadEff.Monad0()).Bind1()).Apply0()).Functor0()))(f)(sequential(monadParParCont(dictMonadEff))($55)));
        };
    });
};
var applyParCont = function (dictMonadEff) {
    return new Control_Apply.Apply(function () {
        return functorParCont(dictMonadEff);
    }, function (v) {
        return function (v1) {
            return ParCont(function (k) {
                return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))))(function (v2) {
                    return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))))(function (v3) {
                        return Control_Bind.discard(Control_Bind.discardUnit)((dictMonadEff.Monad0()).Bind1())(Control_Monad_Cont_Trans.runContT(v)(function (a) {
                            return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v3))))(function (v4) {
                                if (v4 instanceof Data_Maybe.Nothing) {
                                    return Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(new Data_Maybe.Just(a))));
                                };
                                if (v4 instanceof Data_Maybe.Just) {
                                    return k(a(v4.value0));
                                };
                                throw new Error("Failed pattern match at Control.Parallel.Class line 81, column 7 - line 83, column 26: " + [ v4.constructor.name ]);
                            });
                        }))(function () {
                            return Control_Monad_Cont_Trans.runContT(v1)(function (b) {
                                return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v4) {
                                    if (v4 instanceof Data_Maybe.Nothing) {
                                        return Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v3)(new Data_Maybe.Just(b))));
                                    };
                                    if (v4 instanceof Data_Maybe.Just) {
                                        return k(v4.value0(b));
                                    };
                                    throw new Error("Failed pattern match at Control.Parallel.Class line 87, column 7 - line 89, column 26: " + [ v4.constructor.name ]);
                                });
                            });
                        });
                    });
                });
            });
        };
    });
};
var applicativeParCont = function (dictMonadEff) {
    return new Control_Applicative.Applicative(function () {
        return applyParCont(dictMonadEff);
    }, function ($56) {
        return parallel(monadParParCont(dictMonadEff))(Control_Applicative.pure(Control_Monad_Cont_Trans.applicativeContT((dictMonadEff.Monad0()).Applicative0()))($56));
    });
};
var altParCont = function (dictMonadEff) {
    return new Control_Alt.Alt(function () {
        return functorParCont(dictMonadEff);
    }, function (v) {
        return function (v1) {
            return ParCont(function (k) {
                return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.newRef(false))))(function (v2) {
                    return Control_Bind.discard(Control_Bind.discardUnit)((dictMonadEff.Monad0()).Bind1())(Control_Monad_Cont_Trans.runContT(v)(function (a) {
                        return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v3) {
                            if (v3) {
                                return Control_Applicative.pure((dictMonadEff.Monad0()).Applicative0())(Data_Unit.unit);
                            };
                            return Control_Bind.discard(Control_Bind.discardUnit)((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(true))))(function () {
                                return k(a);
                            });
                        });
                    }))(function () {
                        return Control_Monad_Cont_Trans.runContT(v1)(function (a) {
                            return Control_Bind.bind((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.readRef(v2))))(function (v3) {
                                if (v3) {
                                    return Control_Applicative.pure((dictMonadEff.Monad0()).Applicative0())(Data_Unit.unit);
                                };
                                return Control_Bind.discard(Control_Bind.discardUnit)((dictMonadEff.Monad0()).Bind1())(Control_Monad_Eff_Class.liftEff(dictMonadEff)(unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v2)(true))))(function () {
                                    return k(a);
                                });
                            });
                        });
                    });
                });
            });
        };
    });
};
var plusParCont = function (dictMonadEff) {
    return new Control_Plus.Plus(function () {
        return altParCont(dictMonadEff);
    }, ParCont(function (v) {
        return Control_Applicative.pure((dictMonadEff.Monad0()).Applicative0())(Data_Unit.unit);
    }));
};
var alternativeParCont = function (dictMonadEff) {
    return new Control_Alternative.Alternative(function () {
        return applicativeParCont(dictMonadEff);
    }, function () {
        return plusParCont(dictMonadEff);
    });
};
module.exports = {
    ParCont: ParCont, 
    Parallel: Parallel, 
    parallel: parallel, 
    sequential: sequential, 
    monadParExceptT: monadParExceptT, 
    monadParReaderT: monadParReaderT, 
    monadParWriterT: monadParWriterT, 
    monadParMaybeT: monadParMaybeT, 
    newtypeParCont: newtypeParCont, 
    functorParCont: functorParCont, 
    applyParCont: applyParCont, 
    applicativeParCont: applicativeParCont, 
    altParCont: altParCont, 
    plusParCont: plusParCont, 
    alternativeParCont: alternativeParCont, 
    monadParParCont: monadParParCont
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad.Cont.Trans":32,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Class":33,"../Control.Monad.Eff.Ref":41,"../Control.Monad.Eff.Unsafe":45,"../Control.Monad.Except.Trans":49,"../Control.Monad.Maybe.Trans":51,"../Control.Monad.Reader.Trans":53,"../Control.Monad.Writer.Trans":60,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Function":102,"../Data.Functor":107,"../Data.Functor.Compose":104,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Unit":157,"../Prelude":168}],65:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Control_Parallel_Class = require("../Control.Parallel.Class");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Foldable = require("../Data.Foldable");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var parTraverse_ = function (dictParallel) {
    return function (dictFoldable) {
        return function (f) {
            return function ($8) {
                return Control_Parallel_Class.sequential(dictParallel)(Data_Foldable.traverse_(dictParallel.Applicative1())(dictFoldable)(function ($9) {
                    return Control_Parallel_Class.parallel(dictParallel)(f($9));
                })($8));
            };
        };
    };
};
var parTraverse = function (dictParallel) {
    return function (dictTraversable) {
        return function (f) {
            return function ($10) {
                return Control_Parallel_Class.sequential(dictParallel)(Data_Traversable.traverse(dictTraversable)(dictParallel.Applicative1())(function ($11) {
                    return Control_Parallel_Class.parallel(dictParallel)(f($11));
                })($10));
            };
        };
    };
};
var parSequence_ = function (dictParallel) {
    return function (dictFoldable) {
        return parTraverse_(dictParallel)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var parSequence = function (dictParallel) {
    return function (dictTraversable) {
        return parTraverse(dictParallel)(dictTraversable)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    parSequence: parSequence, 
    parSequence_: parSequence_, 
    parTraverse: parTraverse, 
    parTraverse_: parTraverse_
};

},{"../Control.Category":21,"../Control.Parallel.Class":64,"../Control.Semigroupoid":67,"../Data.Foldable":97,"../Data.Traversable":152,"../Prelude":168}],66:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Data_Functor = require("../Data.Functor");
var Plus = function (Alt0, empty) {
    this.Alt0 = Alt0;
    this.empty = empty;
};
var plusArray = new Plus(function () {
    return Control_Alt.altArray;
}, [  ]);
var empty = function (dict) {
    return dict.empty;
};
module.exports = {
    Plus: Plus, 
    empty: empty, 
    plusArray: plusArray
};

},{"../Control.Alt":12,"../Data.Functor":107}],67:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Semigroupoid = function (compose) {
    this.compose = compose;
};
var semigroupoidFn = new Semigroupoid(function (f) {
    return function (g) {
        return function (x) {
            return f(g(x));
        };
    };
});
var compose = function (dict) {
    return dict.compose;
};
var composeFlipped = function (dictSemigroupoid) {
    return function (f) {
        return function (g) {
            return compose(dictSemigroupoid)(g)(f);
        };
    };
};
module.exports = {
    Semigroupoid: Semigroupoid, 
    compose: compose, 
    composeFlipped: composeFlipped, 
    semigroupoidFn: semigroupoidFn
};

},{}],68:[function(require,module,exports){
var xs = require('xstream').default;
var flattenConcurrently = require('xstream/extra/flattenConcurrently').default;
var concat = require('xstream/extra/concat').default;
var delay = require('xstream/extra/delay').default;

exports._addListener = function (effL, s) {
  return function () {
    var _n = effL.next;
    var _e = effL.error;
    var _c = effL.complete;
    effL.next = function (a) {
      return _n(a)();
    }
    effL.error = function (e) {
      return _e(e)();
    }
    effL.complete = function () {
      return _c()();
    }

    return s.addListener(effL);
  };
};

exports._removeListener = function (effL, s) {
  return function () {
    var _n = effL.next;
    var _e = effL.error;
    var _c = effL.complete;
    effL.next = function (a) {
      return _n(a)();
    }
    effL.error = function (e) {
      return _e(e)();
    }
    effL.complete = function () {
      return _c()();
    }

    return s.removeListener(effL);
  }
}

exports._subscribe = function (effL, s) {
  return function () {
    var _n = effL.next;
    var _e = effL.error;
    var _c = effL.complete;
    effL.next = function (a) {
      return _n(a)();
    }
    effL.error = function (e) {
      return _e(e)();
    }
    effL.complete = function () {
      return _c()();
    }

    return s.subscribe(effL);
  }
}

exports._cancelSubscription = function (sub) {
  return function () {
    return sub.unsubscribe();
  }
}

exports._combine = function (p, s1, s2) {
  return xs.combine(
    s1,
    s2
  ).map(function (r) {
    return p(r[0])(r[1]);
  });
};

exports._concat = function (s1, s2) {
  return concat(s1, s2);
};

exports._delay = function (i, s) {
  return function () {
    return s.compose(delay(i));
  };
};

exports._drop = function (i, s) {
  return s.drop(i);
};

exports._fold = function (p, x, s) {
  return s.fold(function (b, a) {
    return p(b)(a);
  }, x);
};

exports._empty = xs.empty();

exports._endWhen = function (s1, s2) {
  return s1.endWhen(s2);
};

exports._filter = function(s, p) {
  return s.filter(p);
};

exports._flatMap = function (s, p) {
  return s.map(p).compose(flattenConcurrently);
};

exports._flatMapEff = function (s, effP) {
  return function () {
    return s.map(function (a) {
      var result = effP(a)();
      return result;
    }).compose(flattenConcurrently);
  };
};

exports._flatMapLatest = function (s, p) {
  return s.map(p).flatten();
};

exports._flatMapLatestEff = function (s, effP) {
  return function () {
    return s.map(function (a) {
      var result = effP(a)();
      return result;
    }).flatten();
  };
};

exports._imitate = function (s1, s2) {
  return function () {
    s1.imitate(s2);
  };
};

exports._last = function (s) {
  return s.last();
};

exports._map = function (p, s) {
  return s.map(p);
};

exports._mapTo = function (s, v) {
  return s.mapTo(v);
};

exports._merge = function (s1, s2) {
  return xs.merge(s1, s2);
};

exports._of = xs.of;

exports._startWith = function (s, x) {
  return s.startWith(x);
};

exports._replaceError = function (s, p) {
  return s.replaceError(p);
};

exports._take = function (i, s) {
  return s.take(i);
};

var adaptListenerToEff = function (l) {
  return {
    next: function (x) {
      return function () {
        l.next(x);
      };
    },
    error: function (e) {
      return function () {
        l.error(e);
      };
    },
    complete: function () {
      return function () {
        l.complete();
      };
    }
  };
};

var adaptEffProducer = function (p) {
  return {
    start: function (x) {
      return p.start(adaptListenerToEff(x))();
    },
    stop: function () {
      return p.stop()();
    }
  };
};

exports.create = function (p) {
  return function () {
    return xs.create(adaptEffProducer(p));
  };
};

exports["create'"] = function () {
  return xs.create();
};

exports.createWithMemory = function (p) {
  return function () {
    return xs.createWithMemory(adaptEffProducer(p));
  };
};

exports.flatten = function (s) {
  return s.flatten();
};

exports.flattenEff = function (s) {
  return function () {
    return s.map(function (effS) {
      return effS();
    }).flatten();
  };
};

exports.fromArray = xs.fromArray;

exports.never = xs.never();

exports.periodic = function (t) {
  return function () {
    return xs.periodic(t);
  };
};

exports.remember = function (s) {
  return s.remember();
};

exports.throw = xs.throw;

exports.unsafeLog = function (a) {
  return function () {
    console.log(a);
  };
};

exports._shamefullySendNext = function (x, s) {
  return function () {
    s.shamefullySendNext(x);
  };
};

exports._shamefullySendError = function (e, s) {
  return function () {
    s.shamefullySendError(e);
  };
};

exports._shamefullySendComplete = function (_, s) {
  return function () {
    s.shamefullySendComplete();
  };
};

},{"xstream":11,"xstream/extra/concat":8,"xstream/extra/delay":9,"xstream/extra/flattenConcurrently":10}],69:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Aff = require("../Control.Monad.Aff");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Console = require("../Control.Monad.Eff.Console");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Timer = require("../Control.Monad.Eff.Timer");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var take = Data_Function_Uncurried.runFn2($foreign._take);
var switchMapEff = function (s) {
    return function (effP) {
        return $foreign._flatMapLatestEff(s, effP);
    };
};
var switchMap = function (s) {
    return function (p) {
        return $foreign._flatMapLatest(s, p);
    };
};
var subscribe = function (l) {
    return function (s) {
        return $foreign._subscribe(l, s);
    };
};
var startWith = function (x) {
    return function (s) {
        return $foreign._startWith(s, x);
    };
};
var shamefullySendNext = Data_Function_Uncurried.runFn2($foreign._shamefullySendNext);
var shamefullySendError = Data_Function_Uncurried.runFn2($foreign._shamefullySendError);
var shamefullySendComplete = Data_Function_Uncurried.runFn2($foreign._shamefullySendComplete);
var semigroupStream = new Data_Semigroup.Semigroup(Data_Function_Uncurried.runFn2($foreign._concat));
var replaceError = function (p) {
    return function (s) {
        return $foreign._replaceError(s, p);
    };
};
var removeListener = function (l) {
    return function (s) {
        return $foreign._removeListener(l, s);
    };
};
var monoidStream = new Data_Monoid.Monoid(function () {
    return semigroupStream;
}, $foreign._empty);
var mapTo = function (v) {
    return function (s) {
        return $foreign._mapTo(s, v);
    };
};
var last = function (s) {
    return $foreign._last(s);
};
var imitate = function (s1) {
    return function (s2) {
        return Control_Monad_Eff_Exception["try"]($foreign._imitate(s1, s2));
    };
};
var functorStream = new Data_Functor.Functor(Data_Function_Uncurried.runFn2($foreign._map));
var fromCallback = function (cb) {
    return $foreign.create({
        start: function (l) {
            return Data_Functor["void"](Control_Monad_Eff.functorEff)(cb(l.next));
        }, 
        stop: Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit))
    });
};
var fromAff = function (aff) {
    return function __do() {
        var v = Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value)();
        return $foreign.create({
            start: function (l) {
                return function __do() {
                    var v1 = Control_Monad_Aff.runAff(l.error)(function (a) {
                        return function __do() {
                            l.next(a)();
                            return l.complete(Data_Unit.unit)();
                        };
                    })(aff)();
                    return Control_Monad_Eff_Class.liftEff(Control_Monad_Eff_Class.monadEffEff)(Control_Monad_Eff_Ref.writeRef(v)(new Data_Maybe.Just(v1)))();
                };
            }, 
            stop: function (v1) {
                return function __do() {
                    var v2 = Control_Monad_Eff_Ref.readRef(v)();
                    if (v2 instanceof Data_Maybe.Just) {
                        return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_Aff.runAff(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))(Control_Monad_Aff.cancel(v2.value0)(Control_Monad_Eff_Exception.error("Unsubscribed"))))();
                    };
                    if (v2 instanceof Data_Maybe.Nothing) {
                        return Data_Unit.unit;
                    };
                    throw new Error("Failed pattern match at Control.XStream line 205, column 9 - line 207, column 31: " + [ v2.constructor.name ]);
                };
            }
        })();
    };
};
var fold = function (p) {
    return function (x) {
        return function (s) {
            return $foreign._fold(p, x, s);
        };
    };
};
var filter = function (p) {
    return function (s) {
        return $foreign._filter(s, p);
    };
};
var endWhen = function (s1) {
    return function (s2) {
        return $foreign._endWhen(s1, s2);
    };
};
var drop = Data_Function_Uncurried.runFn2($foreign._drop);
var delay = Data_Function_Uncurried.runFn2($foreign._delay);
var defaultListener = {
    next: $foreign.unsafeLog, 
    error: function ($10) {
        return Control_Monad_Eff_Console.log(Control_Monad_Eff_Exception.message($10));
    }, 
    complete: Control_Applicative.pure(Control_Monad_Eff.applicativeEff)
};
var cancelSubscription = $foreign._cancelSubscription;
var bindEff = function (s) {
    return function (effP) {
        return $foreign._flatMapEff(s, effP);
    };
};
var applyStream = new Control_Apply.Apply(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn3($foreign._combine)(Control_Category.id(Control_Category.categoryFn)));
var bindStream = new Control_Bind.Bind(function () {
    return applyStream;
}, Data_Function_Uncurried.runFn2($foreign._flatMap));
var applicativeStream = new Control_Applicative.Applicative(function () {
    return applyStream;
}, $foreign._of);
var monadStream = new Control_Monad.Monad(function () {
    return applicativeStream;
}, function () {
    return bindStream;
});
var altStream = new Control_Alt.Alt(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn2($foreign._merge));
var plusStream = new Control_Plus.Plus(function () {
    return altStream;
}, $foreign._empty);
var addListener = function (l) {
    return function (s) {
        return $foreign._addListener(l, s);
    };
};
module.exports = {
    addListener: addListener, 
    bindEff: bindEff, 
    cancelSubscription: cancelSubscription, 
    defaultListener: defaultListener, 
    delay: delay, 
    drop: drop, 
    endWhen: endWhen, 
    filter: filter, 
    fold: fold, 
    fromAff: fromAff, 
    fromCallback: fromCallback, 
    imitate: imitate, 
    last: last, 
    mapTo: mapTo, 
    removeListener: removeListener, 
    replaceError: replaceError, 
    shamefullySendComplete: shamefullySendComplete, 
    shamefullySendError: shamefullySendError, 
    shamefullySendNext: shamefullySendNext, 
    startWith: startWith, 
    subscribe: subscribe, 
    switchMap: switchMap, 
    switchMapEff: switchMapEff, 
    take: take, 
    functorStream: functorStream, 
    applyStream: applyStream, 
    applicativeStream: applicativeStream, 
    bindStream: bindStream, 
    monadStream: monadStream, 
    semigroupStream: semigroupStream, 
    altStream: altStream, 
    monoidStream: monoidStream, 
    plusStream: plusStream, 
    create: $foreign.create, 
    "create'": $foreign["create'"], 
    createWithMemory: $foreign.createWithMemory, 
    flatten: $foreign.flatten, 
    flattenEff: $foreign.flattenEff, 
    fromArray: $foreign.fromArray, 
    never: $foreign.never, 
    periodic: $foreign.periodic, 
    remember: $foreign.remember, 
    "throw": $foreign["throw"]
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Aff":30,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Class":33,"../Control.Monad.Eff.Console":35,"../Control.Monad.Eff.Exception":37,"../Control.Monad.Eff.Ref":41,"../Control.Monad.Eff.Timer":43,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Either":90,"../Data.Function":102,"../Data.Function.Uncurried":101,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.Semigroup":141,"../Data.Unit":157,"../Prelude":168,"./foreign":68}],70:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Monad_Eff = require("../Control.Monad.Eff");
module.exports = {};

},{"../Control.Monad.Eff":47}],71:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_ST = require("../Control.Monad.ST");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Array_ST = require("../Data.Array.ST");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Semiring = require("../Data.Semiring");
var Prelude = require("../Prelude");
var Iterator = (function () {
    function Iterator(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Iterator.create = function (value0) {
        return function (value1) {
            return new Iterator(value0, value1);
        };
    };
    return Iterator;
})();
var peek = function (v) {
    return function __do() {
        var v1 = Control_Monad_ST.readSTRef(v.value1)();
        return v.value0(v1);
    };
};
var next = function (v) {
    return function __do() {
        var v1 = Control_Monad_ST.readSTRef(v.value1)();
        var v2 = Control_Monad_ST.modifySTRef(v.value1)(function (v2) {
            return v2 + 1 | 0;
        })();
        return v.value0(v1);
    };
};
var pushWhile = function (p) {
    return function (iter) {
        return function (array) {
            return function __do() {
                var v = Control_Monad_ST.newSTRef(false)();
                while (Data_Functor.map(Control_Monad_Eff.functorEff)(Data_HeytingAlgebra.not(Data_HeytingAlgebra.heytingAlgebraBoolean))(Control_Monad_ST.readSTRef(v))()) {
                    (function __do() {
                        var v1 = peek(iter)();
                        if (v1 instanceof Data_Maybe.Just && p(v1.value0)) {
                            var v2 = Data_Array_ST.pushSTArray(array)(v1.value0)();
                            return Data_Functor["void"](Control_Monad_Eff.functorEff)(next(iter))();
                        };
                        return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_ST.writeSTRef(v)(true))();
                    })();
                };
                return {};
            };
        };
    };
};
var pushAll = pushWhile(Data_Function["const"](true));
var iterator = function (f) {
    return Data_Functor.map(Control_Monad_Eff.functorEff)(Iterator.create(f))(Control_Monad_ST.newSTRef(0));
};
var iterate = function (iter) {
    return function (f) {
        return function __do() {
            var v = Control_Monad_ST.newSTRef(false)();
            while (Data_Functor.map(Control_Monad_Eff.functorEff)(Data_HeytingAlgebra.not(Data_HeytingAlgebra.heytingAlgebraBoolean))(Control_Monad_ST.readSTRef(v))()) {
                (function __do() {
                    var v1 = next(iter)();
                    if (v1 instanceof Data_Maybe.Just) {
                        return f(v1.value0)();
                    };
                    if (v1 instanceof Data_Maybe.Nothing) {
                        return Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Monad_ST.writeSTRef(v)(true))();
                    };
                    throw new Error("Failed pattern match at Data.Array.ST.Iterator line 39, column 5 - line 41, column 46: " + [ v1.constructor.name ]);
                })();
            };
            return {};
        };
    };
};
var exhausted = function ($27) {
    return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Maybe.isNothing)(peek($27));
};
module.exports = {
    exhausted: exhausted, 
    iterate: iterate, 
    iterator: iterator, 
    next: next, 
    peek: peek, 
    pushAll: pushAll, 
    pushWhile: pushWhile
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Monad.Eff":47,"../Control.Monad.ST":56,"../Control.Semigroupoid":67,"../Data.Array.ST":73,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Maybe":122,"../Data.Semiring":143,"../Prelude":168}],72:[function(require,module,exports){
"use strict";

exports.runSTArray = function (f) {
  return f;
};

exports.emptySTArray = function () {
  return [];
};

exports.peekSTArrayImpl = function (just) {
  return function (nothing) {
    return function (xs) {
      return function (i) {
        return function () {
          return i >= 0 && i < xs.length ? just(xs[i]) : nothing;
        };
      };
    };
  };
};

exports.pokeSTArray = function (xs) {
  return function (i) {
    return function (a) {
      return function () {
        var ret = i >= 0 && i < xs.length;
        if (ret) xs[i] = a;
        return ret;
      };
    };
  };
};

exports.pushAllSTArray = function (xs) {
  return function (as) {
    return function () {
      return xs.push.apply(xs, as);
    };
  };
};

exports.spliceSTArray = function (xs) {
  return function (i) {
    return function (howMany) {
      return function (bs) {
        return function () {
          return xs.splice.apply(xs, [i, howMany].concat(bs));
        };
      };
    };
  };
};

exports.copyImpl = function (xs) {
  return function () {
    return xs.slice();
  };
};

exports.toAssocArray = function (xs) {
  return function () {
    var n = xs.length;
    var as = new Array(n);
    for (var i = 0; i < n; i++) as[i] = { value: xs[i], index: i };
    return as;
  };
};

},{}],73:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_ST = require("../Control.Monad.ST");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Maybe = require("../Data.Maybe");
var Prelude = require("../Prelude");
var Unsafe_Coerce = require("../Unsafe.Coerce");
var unsafeFreeze = function ($0) {
    return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Unsafe_Coerce.unsafeCoerce($0));
};
var thaw = $foreign.copyImpl;
var pushSTArray = function (arr) {
    return function (a) {
        return $foreign.pushAllSTArray(arr)([ a ]);
    };
};
var peekSTArray = $foreign.peekSTArrayImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var freeze = $foreign.copyImpl;
module.exports = {
    freeze: freeze, 
    peekSTArray: peekSTArray, 
    pushSTArray: pushSTArray, 
    thaw: thaw, 
    unsafeFreeze: unsafeFreeze, 
    emptySTArray: $foreign.emptySTArray, 
    pokeSTArray: $foreign.pokeSTArray, 
    pushAllSTArray: $foreign.pushAllSTArray, 
    runSTArray: $foreign.runSTArray, 
    spliceSTArray: $foreign.spliceSTArray, 
    toAssocArray: $foreign.toAssocArray
};

},{"../Control.Applicative":14,"../Control.Monad.Eff":47,"../Control.Monad.ST":56,"../Control.Semigroupoid":67,"../Data.Maybe":122,"../Prelude":168,"../Unsafe.Coerce":171,"./foreign":72}],74:[function(require,module,exports){
"use strict";

//------------------------------------------------------------------------------
// Array creation --------------------------------------------------------------
//------------------------------------------------------------------------------

exports.range = function (start) {
  return function (end) {
    var step = start > end ? -1 : 1;
    var result = [];
    var i = start, n = 0;
    while (i !== end) {
      result[n++] = i;
      i += step;
    }
    result[n] = i;
    return result;
  };
};

var replicate = function (count) {
  return function (value) {
    if (count < 1) {
      return [];
    }
    var result = new Array(count);
    return result.fill(value);
  };
};

var replicatePolyfill = function (count) {
  return function (value) {
    var result = [];
    var n = 0;
    for (var i = 0; i < count; i++) {
      result[n++] = value;
    }
    return result;
  };
};

// In browsers that have Array.prototype.fill we use it, as it's faster.
exports.replicate = typeof Array.prototype.fill === "function" ?
    replicate :
    replicatePolyfill;

exports.fromFoldableImpl = (function () {
  // jshint maxparams: 2
  function Cons(head, tail) {
    this.head = head;
    this.tail = tail;
  }
  var emptyList = {};

  function curryCons(head) {
    return function (tail) {
      return new Cons(head, tail);
    };
  }

  function listToArray(list) {
    var result = [];
    var count = 0;
    var xs = list;
    while (xs !== emptyList) {
      result[count++] = xs.head;
      xs = xs.tail;
    }
    return result;
  }

  return function (foldr) {
    return function (xs) {
      return listToArray(foldr(curryCons)(emptyList)(xs));
    };
  };
})();

//------------------------------------------------------------------------------
// Array size ------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.length = function (xs) {
  return xs.length;
};

//------------------------------------------------------------------------------
// Extending arrays ------------------------------------------------------------
//------------------------------------------------------------------------------

exports.cons = function (e) {
  return function (l) {
    return [e].concat(l);
  };
};

exports.snoc = function (l) {
  return function (e) {
    var l1 = l.slice();
    l1.push(e);
    return l1;
  };
};

//------------------------------------------------------------------------------
// Non-indexed reads -----------------------------------------------------------
//------------------------------------------------------------------------------

exports["uncons'"] = function (empty) {
  return function (next) {
    return function (xs) {
      return xs.length === 0 ? empty({}) : next(xs[0])(xs.slice(1));
    };
  };
};

//------------------------------------------------------------------------------
// Indexed operations ----------------------------------------------------------
//------------------------------------------------------------------------------

exports.indexImpl = function (just) {
  return function (nothing) {
    return function (xs) {
      return function (i) {
        return i < 0 || i >= xs.length ? nothing :  just(xs[i]);
      };
    };
  };
};

exports.findIndexImpl = function (just) {
  return function (nothing) {
    return function (f) {
      return function (xs) {
        for (var i = 0, l = xs.length; i < l; i++) {
          if (f(xs[i])) return just(i);
        }
        return nothing;
      };
    };
  };
};

exports.findLastIndexImpl = function (just) {
  return function (nothing) {
    return function (f) {
      return function (xs) {
        for (var i = xs.length - 1; i >= 0; i--) {
          if (f(xs[i])) return just(i);
        }
        return nothing;
      };
    };
  };
};

exports._insertAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (a) {
        return function (l) {
          if (i < 0 || i > l.length) return nothing;
          var l1 = l.slice();
          l1.splice(i, 0, a);
          return just(l1);
        };
      };
    };
  };
};

exports._deleteAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (l) {
        if (i < 0 || i >= l.length) return nothing;
        var l1 = l.slice();
        l1.splice(i, 1);
        return just(l1);
      };
    };
  };
};

exports._updateAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (a) {
        return function (l) {
          if (i < 0 || i >= l.length) return nothing;
          var l1 = l.slice();
          l1[i] = a;
          return just(l1);
        };
      };
    };
  };
};

//------------------------------------------------------------------------------
// Transformations -------------------------------------------------------------
//------------------------------------------------------------------------------

exports.reverse = function (l) {
  return l.slice().reverse();
};

exports.concat = function (xss) {
  if (xss.length <= 10000) {
    // This method is faster, but it crashes on big arrays.
    // So we use it when can and fallback to simple variant otherwise.
    return Array.prototype.concat.apply([], xss);
  }

  var result = [];
  for (var i = 0, l = xss.length; i < l; i++) {
    var xs = xss[i];
    for (var j = 0, m = xs.length; j < m; j++) {
      result.push(xs[j]);
    }
  }
  return result;
};

exports.filter = function (f) {
  return function (xs) {
    return xs.filter(f);
  };
};

exports.partition = function (f) {
  return function (xs) {
    var yes = [];
    var no  = [];
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      if (f(x))
        yes.push(x);
      else
        no.push(x);
    }
    return { yes: yes, no: no };
  };
};

//------------------------------------------------------------------------------
// Sorting ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.sortImpl = function (f) {
  return function (l) {
    // jshint maxparams: 2
    return l.slice().sort(function (x, y) {
      return f(x)(y);
    });
  };
};

//------------------------------------------------------------------------------
// Subarrays -------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.slice = function (s) {
  return function (e) {
    return function (l) {
      return l.slice(s, e);
    };
  };
};

exports.take = function (n) {
  return function (l) {
    return n < 1 ? [] : l.slice(0, n);
  };
};

exports.drop = function (n) {
  return function (l) {
    return n < 1 ? l : l.slice(n);
  };
};

//------------------------------------------------------------------------------
// Zipping ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.zipWith = function (f) {
  return function (xs) {
    return function (ys) {
      var l = xs.length < ys.length ? xs.length : ys.length;
      var result = new Array(l);
      for (var i = 0; i < l; i++) {
        result[i] = f(xs[i])(ys[i]);
      }
      return result;
    };
  };
};

//------------------------------------------------------------------------------
// Partial ---------------------------------------------------------------------
//------------------------------------------------------------------------------

exports.unsafeIndexImpl = function (xs) {
  return function (n) {
    return xs[n];
  };
};

},{}],75:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_ST = require("../Control.Monad.ST");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Array_ST = require("../Data.Array.ST");
var Data_Array_ST_Iterator = require("../Data.Array.ST.Iterator");
var Data_Boolean = require("../Data.Boolean");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Partial_Unsafe = require("../Partial.Unsafe");
var Prelude = require("../Prelude");
var zipWithA = function (dictApplicative) {
    return function (f) {
        return function (xs) {
            return function (ys) {
                return Data_Traversable.sequence(Data_Traversable.traversableArray)(dictApplicative)($foreign.zipWith(f)(xs)(ys));
            };
        };
    };
};
var zip = $foreign.zipWith(Data_Tuple.Tuple.create);
var updateAt = $foreign._updateAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var unzip = $foreign["uncons'"](function (v) {
    return new Data_Tuple.Tuple([  ], [  ]);
})(function (v) {
    return function (ts) {
        var v1 = unzip(ts);
        return new Data_Tuple.Tuple($foreign.cons(v.value0)(v1.value0), $foreign.cons(v.value1)(v1.value1));
    };
});
var unsafeIndex = function (dictPartial) {
    return $foreign.unsafeIndexImpl;
};
var uncons = $foreign["uncons'"](Data_Function["const"](Data_Maybe.Nothing.value))(function (x) {
    return function (xs) {
        return new Data_Maybe.Just({
            head: x, 
            tail: xs
        });
    };
});
var toUnfoldable = function (dictUnfoldable) {
    return function (xs) {
        var len = $foreign.length(xs);
        var f = function (i) {
            if (i < len) {
                return new Data_Maybe.Just(new Data_Tuple.Tuple(unsafeIndex()(xs)(i), i + 1 | 0));
            };
            if (Data_Boolean.otherwise) {
                return Data_Maybe.Nothing.value;
            };
            throw new Error("Failed pattern match at Data.Array line 132, column 19 - line 137, column 26: " + [ i.constructor.name ]);
        };
        return Data_Unfoldable.unfoldr(dictUnfoldable)(f)(0);
    };
};
var tail = $foreign["uncons'"](Data_Function["const"](Data_Maybe.Nothing.value))(function (v) {
    return function (xs) {
        return new Data_Maybe.Just(xs);
    };
});
var sortBy = function (comp) {
    return function (xs) {
        var comp$prime = function (x) {
            return function (y) {
                var v = comp(x)(y);
                if (v instanceof Data_Ordering.GT) {
                    return 1;
                };
                if (v instanceof Data_Ordering.EQ) {
                    return 0;
                };
                if (v instanceof Data_Ordering.LT) {
                    return -1 | 0;
                };
                throw new Error("Failed pattern match at Data.Array line 462, column 15 - line 467, column 1: " + [ v.constructor.name ]);
            };
        };
        return $foreign.sortImpl(comp$prime)(xs);
    };
};
var sortWith = function (dictOrd) {
    return function (f) {
        return sortBy(Data_Ord.comparing(dictOrd)(f));
    };
};
var sort = function (dictOrd) {
    return function (xs) {
        return sortBy(Data_Ord.compare(dictOrd))(xs);
    };
};
var singleton = function (a) {
    return [ a ];
};
var $$null = function (xs) {
    return $foreign.length(xs) === 0;
};
var nubBy = function (eq) {
    return function (xs) {
        var v = uncons(xs);
        if (v instanceof Data_Maybe.Just) {
            return $foreign.cons(v.value0.head)(nubBy(eq)($foreign.filter(function (y) {
                return !eq(v.value0.head)(y);
            })(v.value0.tail)));
        };
        if (v instanceof Data_Maybe.Nothing) {
            return [  ];
        };
        throw new Error("Failed pattern match at Data.Array line 570, column 3 - line 572, column 18: " + [ v.constructor.name ]);
    };
};
var nub = function (dictEq) {
    return nubBy(Data_Eq.eq(dictEq));
};
var mapWithIndex = function (f) {
    return function (xs) {
        return $foreign.zipWith(f)($foreign.range(0)($foreign.length(xs) - 1 | 0))(xs);
    };
};
var some = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Apply.apply((dictAlternative.Applicative0()).Apply0())(Data_Functor.map(((dictAlternative.Plus1()).Alt0()).Functor0())($foreign.cons)(v))(Control_Lazy.defer(dictLazy)(function (v1) {
                return many(dictAlternative)(dictLazy)(v);
            }));
        };
    };
};
var many = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Alt.alt((dictAlternative.Plus1()).Alt0())(some(dictAlternative)(dictLazy)(v))(Control_Applicative.pure(dictAlternative.Applicative0())([  ]));
        };
    };
};
var insertAt = $foreign._insertAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var init = function (xs) {
    if ($$null(xs)) {
        return Data_Maybe.Nothing.value;
    };
    if (Data_Boolean.otherwise) {
        return new Data_Maybe.Just($foreign.slice(0)($foreign.length(xs) - 1 | 0)(xs));
    };
    throw new Error("Failed pattern match at Data.Array line 248, column 1 - line 250, column 55: " + [ xs.constructor.name ]);
};
var index = $foreign.indexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var last = function (xs) {
    return index(xs)($foreign.length(xs) - 1 | 0);
};
var unsnoc = function (xs) {
    return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(function (v) {
        return function (v1) {
            return {
                init: v, 
                last: v1
            };
        };
    })(init(xs)))(last(xs));
};
var modifyAt = function (i) {
    return function (f) {
        return function (xs) {
            var go = function (x) {
                return updateAt(i)(f(x))(xs);
            };
            return Data_Maybe.maybe(Data_Maybe.Nothing.value)(go)(index(xs)(i));
        };
    };
};
var span = function (p) {
    return function (arr) {
        var go = function (__copy_i) {
            var i = __copy_i;
            var __tco_done = false;
            var __tco_result;
            var __tco_i;
            function __tco_loop(i) {
                var v = index(arr)(i);
                if (v instanceof Data_Maybe.Just) {
                    var $67 = p(v.value0);
                    if ($67) {
                        __tco_i = i + 1 | 0;
                        return;
                    };
                    __tco_done = true;
                    return new Data_Maybe.Just(i);
                };
                if (v instanceof Data_Maybe.Nothing) {
                    __tco_done = true;
                    return Data_Maybe.Nothing.value;
                };
                throw new Error("Failed pattern match at Data.Array line 528, column 5 - line 530, column 25: " + [ v.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(i);
                i = __tco_i;
            };
            return __tco_result;
        };
        var breakIndex = go(0);
        if (breakIndex instanceof Data_Maybe.Just && breakIndex.value0 === 0) {
            return {
                init: [  ], 
                rest: arr
            };
        };
        if (breakIndex instanceof Data_Maybe.Just) {
            return {
                init: $foreign.slice(0)(breakIndex.value0)(arr), 
                rest: $foreign.slice(breakIndex.value0)($foreign.length(arr))(arr)
            };
        };
        if (breakIndex instanceof Data_Maybe.Nothing) {
            return {
                init: arr, 
                rest: [  ]
            };
        };
        throw new Error("Failed pattern match at Data.Array line 515, column 3 - line 521, column 30: " + [ breakIndex.constructor.name ]);
    };
};
var takeWhile = function (p) {
    return function (xs) {
        return (span(p)(xs)).init;
    };
};
var head = function (xs) {
    return index(xs)(0);
};
var groupBy = function (op) {
    return function (xs) {
        return Control_Monad_ST.pureST(function __do() {
            var v = Data_Array_ST.emptySTArray();
            var v1 = Data_Array_ST_Iterator.iterator(function (v1) {
                return index(xs)(v1);
            })();
            Data_Array_ST_Iterator.iterate(v1)(function (x) {
                return Data_Functor["void"](Control_Monad_Eff.functorEff)(function __do() {
                    var v2 = Data_Array_ST.emptySTArray();
                    Data_Array_ST_Iterator.pushWhile(op(x))(v1)(v2)();
                    var v3 = Data_Array_ST.unsafeFreeze(v2)();
                    return Data_Array_ST.pushSTArray(v)(new Data_NonEmpty.NonEmpty(x, v3))();
                });
            })();
            return Data_Array_ST.unsafeFreeze(v)();
        });
    };
};
var group = function (dictEq) {
    return function (xs) {
        return groupBy(Data_Eq.eq(dictEq))(xs);
    };
};
var group$prime = function (dictOrd) {
    return function ($89) {
        return group(dictOrd.Eq0())(sort(dictOrd)($89));
    };
};
var fromFoldable = function (dictFoldable) {
    return $foreign.fromFoldableImpl(Data_Foldable.foldr(dictFoldable));
};
var foldRecM = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (array) {
                var go = function (res) {
                    return function (i) {
                        if (i >= $foreign.length(array)) {
                            return Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0())(new Control_Monad_Rec_Class.Done(res));
                        };
                        if (Data_Boolean.otherwise) {
                            return Control_Bind.bind((dictMonadRec.Monad0()).Bind1())(f(res)(unsafeIndex()(array)(i)))(function (v) {
                                return Control_Applicative.pure((dictMonadRec.Monad0()).Applicative0())(new Control_Monad_Rec_Class.Loop({
                                    a: v, 
                                    b: i + 1 | 0
                                }));
                            });
                        };
                        throw new Error("Failed pattern match at Data.Array line 671, column 3 - line 675, column 42: " + [ res.constructor.name, i.constructor.name ]);
                    };
                };
                return Control_Monad_Rec_Class.tailRecM2(dictMonadRec)(go)(a)(0);
            };
        };
    };
};
var foldM = function (dictMonad) {
    return function (f) {
        return function (a) {
            return $foreign["uncons'"](function (v) {
                return Control_Applicative.pure(dictMonad.Applicative0())(a);
            })(function (b) {
                return function (bs) {
                    return Control_Bind.bind(dictMonad.Bind1())(f(a)(b))(function (a$prime) {
                        return foldM(dictMonad)(f)(a$prime)(bs);
                    });
                };
            });
        };
    };
};
var findLastIndex = $foreign.findLastIndexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var insertBy = function (cmp) {
    return function (x) {
        return function (ys) {
            var i = Data_Maybe.maybe(0)(function (v) {
                return v + 1 | 0;
            })(findLastIndex(function (y) {
                return Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(x)(y))(Data_Ordering.GT.value);
            })(ys));
            return Data_Maybe.fromJust()(insertAt(i)(x)(ys));
        };
    };
};
var insert = function (dictOrd) {
    return insertBy(Data_Ord.compare(dictOrd));
};
var findIndex = $foreign.findIndexImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var intersectBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return $foreign.filter(function (x) {
                return Data_Maybe.isJust(findIndex(eq(x))(ys));
            })(xs);
        };
    };
};
var intersect = function (dictEq) {
    return intersectBy(Data_Eq.eq(dictEq));
};
var elemLastIndex = function (dictEq) {
    return function (x) {
        return findLastIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var elemIndex = function (dictEq) {
    return function (x) {
        return findIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var dropWhile = function (p) {
    return function (xs) {
        return (span(p)(xs)).rest;
    };
};
var deleteAt = $foreign._deleteAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var deleteBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2.length === 0) {
                return [  ];
            };
            return Data_Maybe.maybe(v2)(function (i) {
                return Data_Maybe.fromJust()(deleteAt(i)(v2));
            })(findIndex(v(v1))(v2));
        };
    };
};
var unionBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return Data_Semigroup.append(Data_Semigroup.semigroupArray)(xs)(Data_Foldable.foldl(Data_Foldable.foldableArray)(Data_Function.flip(deleteBy(eq)))(nubBy(eq)(ys))(xs));
        };
    };
};
var union = function (dictEq) {
    return unionBy(Data_Eq.eq(dictEq));
};
var $$delete = function (dictEq) {
    return deleteBy(Data_Eq.eq(dictEq));
};
var difference = function (dictEq) {
    return Data_Foldable.foldr(Data_Foldable.foldableArray)($$delete(dictEq));
};
var concatMap = Data_Function.flip(Control_Bind.bind(Control_Bind.bindArray));
var mapMaybe = function (f) {
    return concatMap(function ($90) {
        return Data_Maybe.maybe([  ])(singleton)(f($90));
    });
};
var filterA = function (dictApplicative) {
    return function (p) {
        return function ($91) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(mapMaybe(function (v) {
                if (v.value1) {
                    return new Data_Maybe.Just(v.value0);
                };
                return Data_Maybe.Nothing.value;
            }))(Data_Traversable.traverse(Data_Traversable.traversableArray)(dictApplicative)(function (x) {
                return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Tuple.Tuple.create(x))(p(x));
            })($91));
        };
    };
};
var catMaybes = mapMaybe(Control_Category.id(Control_Category.categoryFn));
var alterAt = function (i) {
    return function (f) {
        return function (xs) {
            var go = function (x) {
                var v = f(x);
                if (v instanceof Data_Maybe.Nothing) {
                    return deleteAt(i)(xs);
                };
                if (v instanceof Data_Maybe.Just) {
                    return updateAt(i)(v.value0)(xs);
                };
                throw new Error("Failed pattern match at Data.Array line 388, column 10 - line 390, column 32: " + [ v.constructor.name ]);
            };
            return Data_Maybe.maybe(Data_Maybe.Nothing.value)(go)(index(xs)(i));
        };
    };
};
module.exports = {
    alterAt: alterAt, 
    catMaybes: catMaybes, 
    concatMap: concatMap, 
    "delete": $$delete, 
    deleteAt: deleteAt, 
    deleteBy: deleteBy, 
    difference: difference, 
    dropWhile: dropWhile, 
    elemIndex: elemIndex, 
    elemLastIndex: elemLastIndex, 
    filterA: filterA, 
    findIndex: findIndex, 
    findLastIndex: findLastIndex, 
    foldM: foldM, 
    foldRecM: foldRecM, 
    fromFoldable: fromFoldable, 
    group: group, 
    "group'": group$prime, 
    groupBy: groupBy, 
    head: head, 
    index: index, 
    init: init, 
    insert: insert, 
    insertAt: insertAt, 
    insertBy: insertBy, 
    intersect: intersect, 
    intersectBy: intersectBy, 
    last: last, 
    many: many, 
    mapMaybe: mapMaybe, 
    mapWithIndex: mapWithIndex, 
    modifyAt: modifyAt, 
    nub: nub, 
    nubBy: nubBy, 
    "null": $$null, 
    singleton: singleton, 
    some: some, 
    sort: sort, 
    sortBy: sortBy, 
    sortWith: sortWith, 
    span: span, 
    tail: tail, 
    takeWhile: takeWhile, 
    toUnfoldable: toUnfoldable, 
    uncons: uncons, 
    union: union, 
    unionBy: unionBy, 
    unsafeIndex: unsafeIndex, 
    unsnoc: unsnoc, 
    unzip: unzip, 
    updateAt: updateAt, 
    zip: zip, 
    zipWithA: zipWithA, 
    concat: $foreign.concat, 
    cons: $foreign.cons, 
    drop: $foreign.drop, 
    filter: $foreign.filter, 
    length: $foreign.length, 
    partition: $foreign.partition, 
    range: $foreign.range, 
    replicate: $foreign.replicate, 
    reverse: $foreign.reverse, 
    slice: $foreign.slice, 
    snoc: $foreign.snoc, 
    take: $foreign.take, 
    zipWith: $foreign.zipWith
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Lazy":26,"../Control.Monad.Eff":47,"../Control.Monad.Rec.Class":54,"../Control.Monad.ST":56,"../Control.Semigroupoid":67,"../Data.Array.ST":73,"../Data.Array.ST.Iterator":71,"../Data.Boolean":84,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Maybe":122,"../Data.NonEmpty":132,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Traversable":152,"../Data.Tuple":153,"../Data.Unfoldable":155,"../Partial.Unsafe":165,"../Prelude":168,"./foreign":74}],76:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Bifunctor_Clown = require("../Data.Bifunctor.Clown");
var Data_Bifunctor_Flip = require("../Data.Bifunctor.Flip");
var Data_Bifunctor_Joker = require("../Data.Bifunctor.Joker");
var Data_Bifunctor_Product = require("../Data.Bifunctor.Product");
var Data_Bifunctor_Wrap = require("../Data.Bifunctor.Wrap");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Newtype = require("../Data.Newtype");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Bifoldable = function (bifoldMap, bifoldl, bifoldr) {
    this.bifoldMap = bifoldMap;
    this.bifoldl = bifoldl;
    this.bifoldr = bifoldr;
};
var bifoldr = function (dict) {
    return dict.bifoldr;
};
var bitraverse_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return bifoldr(dictBifoldable)(function ($97) {
                    return Control_Apply.applySecond(dictApplicative.Apply0())(f($97));
                })(function ($98) {
                    return Control_Apply.applySecond(dictApplicative.Apply0())(g($98));
                })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
            };
        };
    };
};
var bifor_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse_(dictBifoldable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
var bisequence_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return bitraverse_(dictBifoldable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var bifoldl = function (dict) {
    return dict.bifoldl;
};
var bifoldableJoker = function (dictFoldable) {
    return new Bifoldable(function (dictMonoid) {
        return function (v) {
            return function (r) {
                return function (v1) {
                    return Data_Foldable.foldMap(dictFoldable)(dictMonoid)(r)(v1);
                };
            };
        };
    }, function (v) {
        return function (r) {
            return function (u) {
                return function (v1) {
                    return Data_Foldable.foldl(dictFoldable)(r)(u)(v1);
                };
            };
        };
    }, function (v) {
        return function (r) {
            return function (u) {
                return function (v1) {
                    return Data_Foldable.foldr(dictFoldable)(r)(u)(v1);
                };
            };
        };
    });
};
var bifoldableClown = function (dictFoldable) {
    return new Bifoldable(function (dictMonoid) {
        return function (l) {
            return function (v) {
                return function (v1) {
                    return Data_Foldable.foldMap(dictFoldable)(dictMonoid)(l)(v1);
                };
            };
        };
    }, function (l) {
        return function (v) {
            return function (u) {
                return function (v1) {
                    return Data_Foldable.foldl(dictFoldable)(l)(u)(v1);
                };
            };
        };
    }, function (l) {
        return function (v) {
            return function (u) {
                return function (v1) {
                    return Data_Foldable.foldr(dictFoldable)(l)(u)(v1);
                };
            };
        };
    });
};
var bifoldMapDefaultR = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return bifoldr(dictBifoldable)(function ($99) {
                    return Data_Semigroup.append(dictMonoid.Semigroup0())(f($99));
                })(function ($100) {
                    return Data_Semigroup.append(dictMonoid.Semigroup0())(g($100));
                })(Data_Monoid.mempty(dictMonoid));
            };
        };
    };
};
var bifoldMapDefaultL = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return bifoldl(dictBifoldable)(function (m) {
                    return function (a) {
                        return Data_Semigroup.append(dictMonoid.Semigroup0())(m)(f(a));
                    };
                })(function (m) {
                    return function (b) {
                        return Data_Semigroup.append(dictMonoid.Semigroup0())(m)(g(b));
                    };
                })(Data_Monoid.mempty(dictMonoid));
            };
        };
    };
};
var bifoldMap = function (dict) {
    return dict.bifoldMap;
};
var bifoldableFlip = function (dictBifoldable) {
    return new Bifoldable(function (dictMonoid) {
        return function (r) {
            return function (l) {
                return function (v) {
                    return bifoldMap(dictBifoldable)(dictMonoid)(l)(r)(v);
                };
            };
        };
    }, function (r) {
        return function (l) {
            return function (u) {
                return function (v) {
                    return bifoldl(dictBifoldable)(l)(r)(u)(v);
                };
            };
        };
    }, function (r) {
        return function (l) {
            return function (u) {
                return function (v) {
                    return bifoldr(dictBifoldable)(l)(r)(u)(v);
                };
            };
        };
    });
};
var bifoldableWrap = function (dictBifoldable) {
    return new Bifoldable(function (dictMonoid) {
        return function (l) {
            return function (r) {
                return function (v) {
                    return bifoldMap(dictBifoldable)(dictMonoid)(l)(r)(v);
                };
            };
        };
    }, function (l) {
        return function (r) {
            return function (u) {
                return function (v) {
                    return bifoldl(dictBifoldable)(l)(r)(u)(v);
                };
            };
        };
    }, function (l) {
        return function (r) {
            return function (u) {
                return function (v) {
                    return bifoldr(dictBifoldable)(l)(r)(u)(v);
                };
            };
        };
    });
};
var bifoldlDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(Data_Newtype.unwrap(Data_Monoid_Dual.newtypeDual)(bifoldMap(dictBifoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($101) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(f)($101)));
                    })(function ($102) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(g)($102)));
                    })(p)))(z);
                };
            };
        };
    };
};
var bifoldrDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(bifoldMap(dictBifoldable)(Data_Monoid_Endo.monoidEndo)(function ($103) {
                        return Data_Monoid_Endo.Endo(f($103));
                    })(function ($104) {
                        return Data_Monoid_Endo.Endo(g($104));
                    })(p))(z);
                };
            };
        };
    };
};
var bifoldableProduct = function (dictBifoldable) {
    return function (dictBifoldable1) {
        return new Bifoldable(function (dictMonoid) {
            return function (l) {
                return function (r) {
                    return function (v) {
                        return Data_Semigroup.append(dictMonoid.Semigroup0())(bifoldMap(dictBifoldable)(dictMonoid)(l)(r)(v.value0))(bifoldMap(dictBifoldable1)(dictMonoid)(l)(r)(v.value1));
                    };
                };
            };
        }, function (l) {
            return function (r) {
                return function (u) {
                    return function (m) {
                        return bifoldlDefault(bifoldableProduct(dictBifoldable)(dictBifoldable1))(l)(r)(u)(m);
                    };
                };
            };
        }, function (l) {
            return function (r) {
                return function (u) {
                    return function (m) {
                        return bifoldrDefault(bifoldableProduct(dictBifoldable)(dictBifoldable1))(l)(r)(u)(m);
                    };
                };
            };
        });
    };
};
var bifold = function (dictBifoldable) {
    return function (dictMonoid) {
        return bifoldMap(dictBifoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var biany = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($105) {
                    return Data_Newtype.unwrap(Data_Monoid_Disj.newtypeDisj)(bifoldMap(dictBifoldable)(Data_Monoid_Disj.monoidDisj(dictBooleanAlgebra.HeytingAlgebra0()))(function ($106) {
                        return Data_Monoid_Disj.Disj(p($106));
                    })(function ($107) {
                        return Data_Monoid_Disj.Disj(q($107));
                    })($105));
                };
            };
        };
    };
};
var biall = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($108) {
                    return Data_Newtype.unwrap(Data_Monoid_Conj.newtypeConj)(bifoldMap(dictBifoldable)(Data_Monoid_Conj.monoidConj(dictBooleanAlgebra.HeytingAlgebra0()))(function ($109) {
                        return Data_Monoid_Conj.Conj(p($109));
                    })(function ($110) {
                        return Data_Monoid_Conj.Conj(q($110));
                    })($108));
                };
            };
        };
    };
};
module.exports = {
    Bifoldable: Bifoldable, 
    biall: biall, 
    biany: biany, 
    bifold: bifold, 
    bifoldMap: bifoldMap, 
    bifoldMapDefaultL: bifoldMapDefaultL, 
    bifoldMapDefaultR: bifoldMapDefaultR, 
    bifoldl: bifoldl, 
    bifoldlDefault: bifoldlDefault, 
    bifoldr: bifoldr, 
    bifoldrDefault: bifoldrDefault, 
    bifor_: bifor_, 
    bisequence_: bisequence_, 
    bitraverse_: bitraverse_, 
    bifoldableClown: bifoldableClown, 
    bifoldableJoker: bifoldableJoker, 
    bifoldableFlip: bifoldableFlip, 
    bifoldableProduct: bifoldableProduct, 
    bifoldableWrap: bifoldableWrap
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Semigroupoid":67,"../Data.Bifunctor.Clown":77,"../Data.Bifunctor.Flip":78,"../Data.Bifunctor.Joker":79,"../Data.Bifunctor.Product":80,"../Data.Bifunctor.Wrap":81,"../Data.Foldable":97,"../Data.Function":102,"../Data.Monoid":129,"../Data.Monoid.Conj":124,"../Data.Monoid.Disj":125,"../Data.Monoid.Dual":126,"../Data.Monoid.Endo":127,"../Data.Newtype":131,"../Data.Semigroup":141,"../Data.Unit":157,"../Prelude":168}],77:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Clown = function (x) {
    return x;
};
var showClown = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Clown " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var ordClown = function (dictOrd) {
    return dictOrd;
};
var newtypeClown = new Data_Newtype.Newtype(function (n) {
    return n;
}, Clown);
var functorClown = new Data_Functor.Functor(function (v) {
    return function (v1) {
        return v1;
    };
});
var eqClown = function (dictEq) {
    return dictEq;
};
var bifunctorClown = function (dictFunctor) {
    return new Data_Bifunctor.Bifunctor(function (f) {
        return function (v) {
            return function (v1) {
                return Data_Functor.map(dictFunctor)(f)(v1);
            };
        };
    });
};
var biapplyClown = function (dictApply) {
    return new Control_Biapply.Biapply(function () {
        return bifunctorClown(dictApply.Functor0());
    }, function (v) {
        return function (v1) {
            return Control_Apply.apply(dictApply)(v)(v1);
        };
    });
};
var biapplicativeClown = function (dictApplicative) {
    return new Control_Biapplicative.Biapplicative(function () {
        return biapplyClown(dictApplicative.Apply0());
    }, function (a) {
        return function (v) {
            return Control_Applicative.pure(dictApplicative)(a);
        };
    });
};
module.exports = {
    Clown: Clown, 
    newtypeClown: newtypeClown, 
    eqClown: eqClown, 
    ordClown: ordClown, 
    showClown: showClown, 
    functorClown: functorClown, 
    bifunctorClown: bifunctorClown, 
    biapplyClown: biapplyClown, 
    biapplicativeClown: biapplicativeClown
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Biapplicative":17,"../Control.Biapply":18,"../Data.Bifunctor":82,"../Data.Eq":92,"../Data.Functor":107,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],78:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Flip = function (x) {
    return x;
};
var showFlip = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Flip " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var ordFlip = function (dictOrd) {
    return dictOrd;
};
var newtypeFlip = new Data_Newtype.Newtype(function (n) {
    return n;
}, Flip);
var functorFlip = function (dictBifunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return Data_Bifunctor.lmap(dictBifunctor)(f)(v);
        };
    });
};
var eqFlip = function (dictEq) {
    return dictEq;
};
var bifunctorFlip = function (dictBifunctor) {
    return new Data_Bifunctor.Bifunctor(function (f) {
        return function (g) {
            return function (v) {
                return Data_Bifunctor.bimap(dictBifunctor)(g)(f)(v);
            };
        };
    });
};
var biapplyFlip = function (dictBiapply) {
    return new Control_Biapply.Biapply(function () {
        return bifunctorFlip(dictBiapply.Bifunctor0());
    }, function (v) {
        return function (v1) {
            return Control_Biapply.biapply(dictBiapply)(v)(v1);
        };
    });
};
var biapplicativeFlip = function (dictBiapplicative) {
    return new Control_Biapplicative.Biapplicative(function () {
        return biapplyFlip(dictBiapplicative.Biapply0());
    }, function (a) {
        return function (b) {
            return Control_Biapplicative.bipure(dictBiapplicative)(b)(a);
        };
    });
};
module.exports = {
    Flip: Flip, 
    newtypeFlip: newtypeFlip, 
    eqFlip: eqFlip, 
    ordFlip: ordFlip, 
    showFlip: showFlip, 
    functorFlip: functorFlip, 
    bifunctorFlip: bifunctorFlip, 
    biapplyFlip: biapplyFlip, 
    biapplicativeFlip: biapplicativeFlip
};

},{"../Control.Biapplicative":17,"../Control.Biapply":18,"../Data.Bifunctor":82,"../Data.Eq":92,"../Data.Functor":107,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],79:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Joker = function (x) {
    return x;
};
var showJoker = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Joker " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var ordJoker = function (dictOrd) {
    return dictOrd;
};
var newtypeJoker = new Data_Newtype.Newtype(function (n) {
    return n;
}, Joker);
var functorJoker = function (dictFunctor) {
    return new Data_Functor.Functor(function (g) {
        return function (v) {
            return Data_Functor.map(dictFunctor)(g)(v);
        };
    });
};
var eqJoker = function (dictEq) {
    return dictEq;
};
var bifunctorJoker = function (dictFunctor) {
    return new Data_Bifunctor.Bifunctor(function (v) {
        return function (g) {
            return function (v1) {
                return Data_Functor.map(dictFunctor)(g)(v1);
            };
        };
    });
};
var biapplyJoker = function (dictApply) {
    return new Control_Biapply.Biapply(function () {
        return bifunctorJoker(dictApply.Functor0());
    }, function (v) {
        return function (v1) {
            return Control_Apply.apply(dictApply)(v)(v1);
        };
    });
};
var biapplicativeJoker = function (dictApplicative) {
    return new Control_Biapplicative.Biapplicative(function () {
        return biapplyJoker(dictApplicative.Apply0());
    }, function (v) {
        return function (b) {
            return Control_Applicative.pure(dictApplicative)(b);
        };
    });
};
module.exports = {
    Joker: Joker, 
    newtypeJoker: newtypeJoker, 
    eqJoker: eqJoker, 
    ordJoker: ordJoker, 
    showJoker: showJoker, 
    functorJoker: functorJoker, 
    bifunctorJoker: bifunctorJoker, 
    biapplyJoker: biapplyJoker, 
    biapplicativeJoker: biapplicativeJoker
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Biapplicative":17,"../Control.Biapply":18,"../Data.Bifunctor":82,"../Data.Eq":92,"../Data.Functor":107,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],80:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Product = (function () {
    function Product(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Product.create = function (value0) {
        return function (value1) {
            return new Product(value0, value1);
        };
    };
    return Product;
})();
var showProduct = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(Product " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var eqProduct = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0) && Data_Eq.eq(dictEq1)(x.value1)(y.value1);
            };
        });
    };
};
var ordProduct = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqProduct(dictOrd.Eq0())(dictOrd1.Eq0());
        }, function (x) {
            return function (y) {
                var $39 = Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                if ($39 instanceof Data_Ordering.LT) {
                    return Data_Ordering.LT.value;
                };
                if ($39 instanceof Data_Ordering.GT) {
                    return Data_Ordering.GT.value;
                };
                return Data_Ord.compare(dictOrd1)(x.value1)(y.value1);
            };
        });
    };
};
var bifunctorProduct = function (dictBifunctor) {
    return function (dictBifunctor1) {
        return new Data_Bifunctor.Bifunctor(function (f) {
            return function (g) {
                return function (v) {
                    return new Product(Data_Bifunctor.bimap(dictBifunctor)(f)(g)(v.value0), Data_Bifunctor.bimap(dictBifunctor1)(f)(g)(v.value1));
                };
            };
        });
    };
};
var biapplyProduct = function (dictBiapply) {
    return function (dictBiapply1) {
        return new Control_Biapply.Biapply(function () {
            return bifunctorProduct(dictBiapply.Bifunctor0())(dictBiapply1.Bifunctor0());
        }, function (v) {
            return function (v1) {
                return new Product(Control_Biapply.biapply(dictBiapply)(v.value0)(v1.value0), Control_Biapply.biapply(dictBiapply1)(v.value1)(v1.value1));
            };
        });
    };
};
var biapplicativeProduct = function (dictBiapplicative) {
    return function (dictBiapplicative1) {
        return new Control_Biapplicative.Biapplicative(function () {
            return biapplyProduct(dictBiapplicative.Biapply0())(dictBiapplicative1.Biapply0());
        }, function (a) {
            return function (b) {
                return new Product(Control_Biapplicative.bipure(dictBiapplicative)(a)(b), Control_Biapplicative.bipure(dictBiapplicative1)(a)(b));
            };
        });
    };
};
module.exports = {
    Product: Product, 
    eqProduct: eqProduct, 
    ordProduct: ordProduct, 
    showProduct: showProduct, 
    bifunctorProduct: bifunctorProduct, 
    biapplyProduct: biapplyProduct, 
    biapplicativeProduct: biapplicativeProduct
};

},{"../Control.Biapplicative":17,"../Control.Biapply":18,"../Data.Bifunctor":82,"../Data.Eq":92,"../Data.HeytingAlgebra":111,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],81:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Wrap = function (x) {
    return x;
};
var showWrap = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Wrap " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var ordWrap = function (dictOrd) {
    return dictOrd;
};
var newtypeWrap = new Data_Newtype.Newtype(function (n) {
    return n;
}, Wrap);
var functorWrap = function (dictBifunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return Data_Bifunctor.rmap(dictBifunctor)(f)(v);
        };
    });
};
var eqWrap = function (dictEq) {
    return dictEq;
};
var bifunctorWrap = function (dictBifunctor) {
    return new Data_Bifunctor.Bifunctor(function (f) {
        return function (g) {
            return function (v) {
                return Data_Bifunctor.bimap(dictBifunctor)(f)(g)(v);
            };
        };
    });
};
var biapplyWrap = function (dictBiapply) {
    return new Control_Biapply.Biapply(function () {
        return bifunctorWrap(dictBiapply.Bifunctor0());
    }, function (v) {
        return function (v1) {
            return Control_Biapply.biapply(dictBiapply)(v)(v1);
        };
    });
};
var biapplicativeWrap = function (dictBiapplicative) {
    return new Control_Biapplicative.Biapplicative(function () {
        return biapplyWrap(dictBiapplicative.Biapply0());
    }, function (a) {
        return function (b) {
            return Control_Biapplicative.bipure(dictBiapplicative)(a)(b);
        };
    });
};
module.exports = {
    Wrap: Wrap, 
    newtypeWrap: newtypeWrap, 
    eqWrap: eqWrap, 
    ordWrap: ordWrap, 
    showWrap: showWrap, 
    functorWrap: functorWrap, 
    bifunctorWrap: bifunctorWrap, 
    biapplyWrap: biapplyWrap, 
    biapplicativeWrap: biapplicativeWrap
};

},{"../Control.Biapplicative":17,"../Control.Biapply":18,"../Data.Bifunctor":82,"../Data.Eq":92,"../Data.Functor":107,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],82:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Bifunctor = function (bimap) {
    this.bimap = bimap;
};
var bimap = function (dict) {
    return dict.bimap;
};
var lmap = function (dictBifunctor) {
    return function (f) {
        return bimap(dictBifunctor)(f)(Control_Category.id(Control_Category.categoryFn));
    };
};
var rmap = function (dictBifunctor) {
    return bimap(dictBifunctor)(Control_Category.id(Control_Category.categoryFn));
};
module.exports = {
    Bifunctor: Bifunctor, 
    bimap: bimap, 
    lmap: lmap, 
    rmap: rmap
};

},{"../Control.Category":21}],83:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bifunctor_Clown = require("../Data.Bifunctor.Clown");
var Data_Bifunctor_Flip = require("../Data.Bifunctor.Flip");
var Data_Bifunctor_Joker = require("../Data.Bifunctor.Joker");
var Data_Bifunctor_Product = require("../Data.Bifunctor.Product");
var Data_Bifunctor_Wrap = require("../Data.Bifunctor.Wrap");
var Data_Functor = require("../Data.Functor");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var Bitraversable = function (Bifoldable1, Bifunctor0, bisequence, bitraverse) {
    this.Bifoldable1 = Bifoldable1;
    this.Bifunctor0 = Bifunctor0;
    this.bisequence = bisequence;
    this.bitraverse = bitraverse;
};
var bitraverse = function (dict) {
    return dict.bitraverse;
};
var lfor = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return bitraverse(dictBitraversable)(dictApplicative)(f)(Control_Applicative.pure(dictApplicative))(t);
            };
        };
    };
};
var ltraverse = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (f) {
            return bitraverse(dictBitraversable)(dictApplicative)(f)(Control_Applicative.pure(dictApplicative));
        };
    };
};
var rfor = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return bitraverse(dictBitraversable)(dictApplicative)(Control_Applicative.pure(dictApplicative))(f)(t);
            };
        };
    };
};
var rtraverse = function (dictBitraversable) {
    return function (dictApplicative) {
        return bitraverse(dictBitraversable)(dictApplicative)(Control_Applicative.pure(dictApplicative));
    };
};
var bitraversableJoker = function (dictTraversable) {
    return new Bitraversable(function () {
        return Data_Bifoldable.bifoldableJoker(dictTraversable.Foldable1());
    }, function () {
        return Data_Bifunctor_Joker.bifunctorJoker(dictTraversable.Functor0());
    }, function (dictApplicative) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Joker.Joker)(Data_Traversable.sequence(dictTraversable)(dictApplicative)(v));
        };
    }, function (dictApplicative) {
        return function (v) {
            return function (r) {
                return function (v1) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Joker.Joker)(Data_Traversable.traverse(dictTraversable)(dictApplicative)(r)(v1));
                };
            };
        };
    });
};
var bitraversableClown = function (dictTraversable) {
    return new Bitraversable(function () {
        return Data_Bifoldable.bifoldableClown(dictTraversable.Foldable1());
    }, function () {
        return Data_Bifunctor_Clown.bifunctorClown(dictTraversable.Functor0());
    }, function (dictApplicative) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Clown.Clown)(Data_Traversable.sequence(dictTraversable)(dictApplicative)(v));
        };
    }, function (dictApplicative) {
        return function (l) {
            return function (v) {
                return function (v1) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Clown.Clown)(Data_Traversable.traverse(dictTraversable)(dictApplicative)(l)(v1));
                };
            };
        };
    });
};
var bisequenceDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return bitraverse(dictBitraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var bisequence = function (dict) {
    return dict.bisequence;
};
var bitraversableFlip = function (dictBitraversable) {
    return new Bitraversable(function () {
        return Data_Bifoldable.bifoldableFlip(dictBitraversable.Bifoldable1());
    }, function () {
        return Data_Bifunctor_Flip.bifunctorFlip(dictBitraversable.Bifunctor0());
    }, function (dictApplicative) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Flip.Flip)(bisequence(dictBitraversable)(dictApplicative)(v));
        };
    }, function (dictApplicative) {
        return function (r) {
            return function (l) {
                return function (v) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Flip.Flip)(bitraverse(dictBitraversable)(dictApplicative)(l)(r)(v));
                };
            };
        };
    });
};
var bitraversableProduct = function (dictBitraversable) {
    return function (dictBitraversable1) {
        return new Bitraversable(function () {
            return Data_Bifoldable.bifoldableProduct(dictBitraversable.Bifoldable1())(dictBitraversable1.Bifoldable1());
        }, function () {
            return Data_Bifunctor_Product.bifunctorProduct(dictBitraversable.Bifunctor0())(dictBitraversable1.Bifunctor0());
        }, function (dictApplicative) {
            return function (v) {
                return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Product.Product.create)(bisequence(dictBitraversable)(dictApplicative)(v.value0)))(bisequence(dictBitraversable1)(dictApplicative)(v.value1));
            };
        }, function (dictApplicative) {
            return function (l) {
                return function (r) {
                    return function (v) {
                        return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Product.Product.create)(bitraverse(dictBitraversable)(dictApplicative)(l)(r)(v.value0)))(bitraverse(dictBitraversable1)(dictApplicative)(l)(r)(v.value1));
                    };
                };
            };
        });
    };
};
var bitraversableWrap = function (dictBitraversable) {
    return new Bitraversable(function () {
        return Data_Bifoldable.bifoldableWrap(dictBitraversable.Bifoldable1());
    }, function () {
        return Data_Bifunctor_Wrap.bifunctorWrap(dictBitraversable.Bifunctor0());
    }, function (dictApplicative) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Wrap.Wrap)(bisequence(dictBitraversable)(dictApplicative)(v));
        };
    }, function (dictApplicative) {
        return function (l) {
            return function (r) {
                return function (v) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Bifunctor_Wrap.Wrap)(bitraverse(dictBitraversable)(dictApplicative)(l)(r)(v));
                };
            };
        };
    });
};
var bitraverseDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return function (t) {
                    return bisequence(dictBitraversable)(dictApplicative)(Data_Bifunctor.bimap(dictBitraversable.Bifunctor0())(f)(g)(t));
                };
            };
        };
    };
};
var bifor = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse(dictBitraversable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
module.exports = {
    Bitraversable: Bitraversable, 
    bifor: bifor, 
    bisequence: bisequence, 
    bisequenceDefault: bisequenceDefault, 
    bitraverse: bitraverse, 
    bitraverseDefault: bitraverseDefault, 
    lfor: lfor, 
    ltraverse: ltraverse, 
    rfor: rfor, 
    rtraverse: rtraverse, 
    bitraversableClown: bitraversableClown, 
    bitraversableJoker: bitraversableJoker, 
    bitraversableFlip: bitraversableFlip, 
    bitraversableProduct: bitraversableProduct, 
    bitraversableWrap: bitraversableWrap
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Data.Bifoldable":76,"../Data.Bifunctor":82,"../Data.Bifunctor.Clown":77,"../Data.Bifunctor.Flip":78,"../Data.Bifunctor.Joker":79,"../Data.Bifunctor.Product":80,"../Data.Bifunctor.Wrap":81,"../Data.Functor":107,"../Data.Traversable":152,"../Prelude":168}],84:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var otherwise = true;
module.exports = {
    otherwise: otherwise
};

},{}],85:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Unit = require("../Data.Unit");
var BooleanAlgebra = function (HeytingAlgebra0) {
    this.HeytingAlgebra0 = HeytingAlgebra0;
};
var booleanAlgebraUnit = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraUnit;
});
var booleanAlgebraFn = function (dictBooleanAlgebra) {
    return new BooleanAlgebra(function () {
        return Data_HeytingAlgebra.heytingAlgebraFunction(dictBooleanAlgebra.HeytingAlgebra0());
    });
};
var booleanAlgebraBoolean = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraBoolean;
});
module.exports = {
    BooleanAlgebra: BooleanAlgebra, 
    booleanAlgebraBoolean: booleanAlgebraBoolean, 
    booleanAlgebraUnit: booleanAlgebraUnit, 
    booleanAlgebraFn: booleanAlgebraFn
};

},{"../Data.HeytingAlgebra":111,"../Data.Unit":157}],86:[function(require,module,exports){
"use strict";

exports.topInt = 2147483647;
exports.bottomInt = -2147483648;

exports.topChar = String.fromCharCode(65535);
exports.bottomChar = String.fromCharCode(0);

},{}],87:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Unit = require("../Data.Unit");
var Bounded = function (Ord0, bottom, top) {
    this.Ord0 = Ord0;
    this.bottom = bottom;
    this.top = top;
};
var top = function (dict) {
    return dict.top;
};
var boundedUnit = new Bounded(function () {
    return Data_Ord.ordUnit;
}, Data_Unit.unit, Data_Unit.unit);
var boundedOrdering = new Bounded(function () {
    return Data_Ord.ordOrdering;
}, Data_Ordering.LT.value, Data_Ordering.GT.value);
var boundedInt = new Bounded(function () {
    return Data_Ord.ordInt;
}, $foreign.bottomInt, $foreign.topInt);
var boundedChar = new Bounded(function () {
    return Data_Ord.ordChar;
}, $foreign.bottomChar, $foreign.topChar);
var boundedBoolean = new Bounded(function () {
    return Data_Ord.ordBoolean;
}, false, true);
var bottom = function (dict) {
    return dict.bottom;
};
module.exports = {
    Bounded: Bounded, 
    bottom: bottom, 
    top: top, 
    boundedBoolean: boundedBoolean, 
    boundedInt: boundedInt, 
    boundedChar: boundedChar, 
    boundedOrdering: boundedOrdering, 
    boundedUnit: boundedUnit
};

},{"../Data.Ord":136,"../Data.Ordering":137,"../Data.Unit":157,"./foreign":86}],88:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var CommutativeRing = function (Ring0) {
    this.Ring0 = Ring0;
};
var commutativeRingUnit = new CommutativeRing(function () {
    return Data_Ring.ringUnit;
});
var commutativeRingNumber = new CommutativeRing(function () {
    return Data_Ring.ringNumber;
});
var commutativeRingInt = new CommutativeRing(function () {
    return Data_Ring.ringInt;
});
var commutativeRingFn = function (dictCommutativeRing) {
    return new CommutativeRing(function () {
        return Data_Ring.ringFn(dictCommutativeRing.Ring0());
    });
};
module.exports = {
    CommutativeRing: CommutativeRing, 
    commutativeRingInt: commutativeRingInt, 
    commutativeRingNumber: commutativeRingNumber, 
    commutativeRingUnit: commutativeRingUnit, 
    commutativeRingFn: commutativeRingFn
};

},{"../Data.Ring":139,"../Data.Semiring":143,"../Data.Unit":157}],89:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Identity = require("../Data.Identity");
var Data_Newtype = require("../Data.Newtype");
var Prelude = require("../Prelude");
var Distributive = function (Functor0, collect, distribute) {
    this.Functor0 = Functor0;
    this.collect = collect;
    this.distribute = distribute;
};
var distributiveIdentity = new Distributive(function () {
    return Data_Identity.functorIdentity;
}, function (dictFunctor) {
    return function (f) {
        return function ($11) {
            return Data_Identity.Identity(Data_Functor.map(dictFunctor)(function ($12) {
                return Data_Newtype.unwrap(Data_Identity.newtypeIdentity)(f($12));
            })($11));
        };
    };
}, function (dictFunctor) {
    return function ($13) {
        return Data_Identity.Identity(Data_Functor.map(dictFunctor)(Data_Newtype.unwrap(Data_Identity.newtypeIdentity))($13));
    };
});
var distribute = function (dict) {
    return dict.distribute;
};
var distributiveFunction = new Distributive(function () {
    return Data_Functor.functorFn;
}, function (dictFunctor) {
    return function (f) {
        return function ($14) {
            return distribute(distributiveFunction)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($14));
        };
    };
}, function (dictFunctor) {
    return function (a) {
        return function (e) {
            return Data_Functor.map(dictFunctor)(function (v) {
                return v(e);
            })(a);
        };
    };
});
var cotraverse = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($15) {
                return Data_Functor.map(dictDistributive.Functor0())(f)(distribute(dictDistributive)(dictFunctor)($15));
            };
        };
    };
};
var collectDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($16) {
                return distribute(dictDistributive)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($16));
            };
        };
    };
};
var collect = function (dict) {
    return dict.collect;
};
var distributeDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return collect(dictDistributive)(dictFunctor)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Distributive: Distributive, 
    collect: collect, 
    collectDefault: collectDefault, 
    cotraverse: cotraverse, 
    distribute: distribute, 
    distributeDefault: distributeDefault, 
    distributiveIdentity: distributiveIdentity, 
    distributiveFunction: distributiveFunction
};

},{"../Control.Category":21,"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Functor":107,"../Data.Identity":112,"../Data.Newtype":131,"../Prelude":168}],90:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var Left = (function () {
    function Left(value0) {
        this.value0 = value0;
    };
    Left.create = function (value0) {
        return new Left(value0);
    };
    return Left;
})();
var Right = (function () {
    function Right(value0) {
        this.value0 = value0;
    };
    Right.create = function (value0) {
        return new Right(value0);
    };
    return Right;
})();
var showEither = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            if (v instanceof Left) {
                return "(Left " + (Data_Show.show(dictShow)(v.value0) + ")");
            };
            if (v instanceof Right) {
                return "(Right " + (Data_Show.show(dictShow1)(v.value0) + ")");
            };
            throw new Error("Failed pattern match at Data.Either line 161, column 3 - line 162, column 3: " + [ v.constructor.name ]);
        });
    };
};
var functorEither = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        if (v1 instanceof Right) {
            return new Right(v(v1.value0));
        };
        throw new Error("Failed pattern match at Data.Either line 37, column 3 - line 37, column 26: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invariantEither = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorEither));
var fromRight = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar62) {
                return $dollar62;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Right) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 253, column 1 - line 253, column 23: " + [ v.constructor.name ]);
        })());
    };
};
var fromLeft = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar66) {
                return $dollar66;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Left) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 248, column 1 - line 248, column 22: " + [ v.constructor.name ]);
        })());
    };
};
var foldableEither = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Left) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Right) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 189, column 3 - line 189, column 31: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 187, column 3 - line 187, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Either line 185, column 3 - line 185, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableEither = new Data_Traversable.Traversable(function () {
    return foldableEither;
}, function () {
    return functorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Control_Applicative.pure(dictApplicative)(new Left(v.value0));
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 203, column 3 - line 203, column 36: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Left) {
                return Control_Applicative.pure(dictApplicative)(new Left(v1.value0));
            };
            if (v1 instanceof Right) {
                return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Right.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 201, column 3 - line 201, column 39: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var extendEither = new Control_Extend.Extend(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        return new Right(v(v1));
    };
});
var eqEither = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                if (x instanceof Left && y instanceof Left) {
                    return Data_Eq.eq(dictEq)(x.value0)(y.value0);
                };
                if (x instanceof Right && y instanceof Right) {
                    return Data_Eq.eq(dictEq1)(x.value0)(y.value0);
                };
                return false;
            };
        });
    };
};
var ordEither = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqEither(dictOrd.Eq0())(dictOrd1.Eq0());
        }, function (x) {
            return function (y) {
                if (x instanceof Left && y instanceof Left) {
                    return Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                };
                if (x instanceof Left) {
                    return Data_Ordering.LT.value;
                };
                if (y instanceof Left) {
                    return Data_Ordering.GT.value;
                };
                if (x instanceof Right && y instanceof Right) {
                    return Data_Ord.compare(dictOrd1)(x.value0)(y.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 176, column 1 - line 176, column 64: " + [ x.constructor.name, y.constructor.name ]);
            };
        });
    };
};
var eq1Either = function (dictEq) {
    return new Data_Eq.Eq1(function (dictEq1) {
        return Data_Eq.eq(eqEither(dictEq)(dictEq1));
    });
};
var ord1Either = function (dictOrd) {
    return new Data_Ord.Ord1(function () {
        return eq1Either(dictOrd.Eq0());
    }, function (dictOrd1) {
        return Data_Ord.compare(ordEither(dictOrd)(dictOrd1));
    });
};
var either = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return v(v2.value0);
            };
            if (v2 instanceof Right) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 230, column 1 - line 230, column 26: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isLeft = either(Data_Function["const"](true))(Data_Function["const"](false));
var isRight = either(Data_Function["const"](false))(Data_Function["const"](true));
var choose = function (dictAlt) {
    return function (a) {
        return function (b) {
            return Control_Alt.alt(dictAlt)(Data_Functor.map(dictAlt.Functor0())(Left.create)(a))(Data_Functor.map(dictAlt.Functor0())(Right.create)(b));
        };
    };
};
var boundedEither = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordEither(dictBounded.Ord0())(dictBounded1.Ord0());
        }, new Left(Data_Bounded.bottom(dictBounded)), new Right(Data_Bounded.top(dictBounded1)));
    };
};
var bifunctorEither = new Data_Bifunctor.Bifunctor(function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return new Left(v(v2.value0));
            };
            if (v2 instanceof Right) {
                return new Right(v1(v2.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 44, column 3 - line 44, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
});
var bifoldableEither = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 197, column 3 - line 197, column 31: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(z)(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(z)(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 195, column 3 - line 195, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0)(z);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0)(z);
                };
                throw new Error("Failed pattern match at Data.Either line 193, column 3 - line 193, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var bitraversableEither = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableEither;
}, function () {
    return bifunctorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Left.create)(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 209, column 3 - line 209, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Left.create)(v(v2.value0));
                };
                if (v2 instanceof Right) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Right.create)(v1(v2.value0));
                };
                throw new Error("Failed pattern match at Data.Either line 207, column 3 - line 207, column 41: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var applyEither = new Control_Apply.Apply(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return new Left(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map(functorEither)(v.value0)(v1);
        };
        throw new Error("Failed pattern match at Data.Either line 80, column 3 - line 80, column 28: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindEither = new Control_Bind.Bind(function () {
    return applyEither;
}, either(function (e) {
    return function (v) {
        return new Left(e);
    };
})(function (a) {
    return function (f) {
        return f(a);
    };
}));
var semigroupEither = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semigroup.append(dictSemigroup))(x))(y);
        };
    });
};
var semiringEither = function (dictSemiring) {
    return new Data_Semiring.Semiring(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.add(dictSemiring))(x))(y);
        };
    }, function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.mul(dictSemiring))(x))(y);
        };
    }, new Right(Data_Semiring.one(dictSemiring)), new Right(Data_Semiring.zero(dictSemiring)));
};
var applicativeEither = new Control_Applicative.Applicative(function () {
    return applyEither;
}, Right.create);
var monadEither = new Control_Monad.Monad(function () {
    return applicativeEither;
}, function () {
    return bindEither;
});
var altEither = new Control_Alt.Alt(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return v1;
        };
        return v;
    };
});
module.exports = {
    Left: Left, 
    Right: Right, 
    choose: choose, 
    either: either, 
    fromLeft: fromLeft, 
    fromRight: fromRight, 
    isLeft: isLeft, 
    isRight: isRight, 
    functorEither: functorEither, 
    invariantEither: invariantEither, 
    bifunctorEither: bifunctorEither, 
    applyEither: applyEither, 
    applicativeEither: applicativeEither, 
    altEither: altEither, 
    bindEither: bindEither, 
    monadEither: monadEither, 
    extendEither: extendEither, 
    showEither: showEither, 
    eqEither: eqEither, 
    eq1Either: eq1Either, 
    ordEither: ordEither, 
    ord1Either: ord1Either, 
    boundedEither: boundedEither, 
    foldableEither: foldableEither, 
    bifoldableEither: bifoldableEither, 
    traversableEither: traversableEither, 
    bitraversableEither: bitraversableEither, 
    semiringEither: semiringEither, 
    semigroupEither: semigroupEither
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bifoldable":76,"../Data.Bifunctor":82,"../Data.Bitraversable":83,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.Traversable":152,"../Prelude":168}],91:[function(require,module,exports){
"use strict";

exports.refEq = function (r1) {
  return function (r2) {
    return r1 === r2;
  };
};

exports.refIneq = function (r1) {
  return function (r2) {
    return r1 !== r2;
  };
};

exports.eqArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      if (xs.length !== ys.length) return false;
      for (var i = 0; i < xs.length; i++) {
        if (!f(xs[i])(ys[i])) return false;
      }
      return true;
    };
  };
};

},{}],92:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Eq = function (eq) {
    this.eq = eq;
};
var Eq1 = function (eq1) {
    this.eq1 = eq1;
};
var eqVoid = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqUnit = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqString = new Eq($foreign.refEq);
var eqNumber = new Eq($foreign.refEq);
var eqInt = new Eq($foreign.refEq);
var eqChar = new Eq($foreign.refEq);
var eqBoolean = new Eq($foreign.refEq);
var eq1 = function (dict) {
    return dict.eq1;
};
var eq = function (dict) {
    return dict.eq;
};
var eqArray = function (dictEq) {
    return new Eq($foreign.eqArrayImpl(eq(dictEq)));
};
var eq1Array = new Eq1(function (dictEq) {
    return eq(eqArray(dictEq));
});
var notEq = function (dictEq) {
    return function (x) {
        return function (y) {
            return eq(eqBoolean)(eq(dictEq)(x)(y))(false);
        };
    };
};
var notEq1 = function (dictEq1) {
    return function (dictEq) {
        return function (x) {
            return function (y) {
                return eq(eqBoolean)(eq1(dictEq1)(dictEq)(x)(y))(false);
            };
        };
    };
};
module.exports = {
    Eq: Eq, 
    Eq1: Eq1, 
    eq: eq, 
    eq1: eq1, 
    notEq: notEq, 
    notEq1: notEq1, 
    eqBoolean: eqBoolean, 
    eqInt: eqInt, 
    eqNumber: eqNumber, 
    eqChar: eqChar, 
    eqString: eqString, 
    eqUnit: eqUnit, 
    eqVoid: eqVoid, 
    eqArray: eqArray, 
    eq1Array: eq1Array
};

},{"../Data.Unit":157,"../Data.Void":158,"./foreign":91}],93:[function(require,module,exports){
"use strict";

exports.intDegree = function (x) {
  return Math.min(Math.abs(x), 2147483647);
};

exports.intDiv = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x / y | 0;
  };
};

exports.intMod = function (x) {
  return function (y) {
    return x % y;
  };
};

exports.numDiv = function (n1) {
  return function (n2) {
    return n1 / n2;
  };
};

},{}],94:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var EuclideanRing = function (CommutativeRing0, degree, div, mod) {
    this.CommutativeRing0 = CommutativeRing0;
    this.degree = degree;
    this.div = div;
    this.mod = mod;
};
var mod = function (dict) {
    return dict.mod;
};
var gcd = function (__copy_dictEq) {
    return function (__copy_dictEuclideanRing) {
        return function (__copy_a) {
            return function (__copy_b) {
                var dictEq = __copy_dictEq;
                var dictEuclideanRing = __copy_dictEuclideanRing;
                var a = __copy_a;
                var b = __copy_b;
                var __tco_done = false;
                var __tco_result;
                var __tco_dictEq;
                var __tco_dictEuclideanRing;
                var __tco_a;
                var __tco_b;
                function __tco_loop(dictEq, dictEuclideanRing, a, b) {
                    var $7 = Data_Eq.eq(dictEq)(b)(Data_Semiring.zero(((dictEuclideanRing.CommutativeRing0()).Ring0()).Semiring0()));
                    if ($7) {
                        __tco_done = true;
                        return a;
                    };
                    __tco_dictEq = dictEq;
                    __tco_dictEuclideanRing = dictEuclideanRing;
                    __tco_a = b;
                    __tco_b = mod(dictEuclideanRing)(a)(b);
                    return;
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(dictEq, dictEuclideanRing, a, b);
                    dictEq = __tco_dictEq;
                    dictEuclideanRing = __tco_dictEuclideanRing;
                    a = __tco_a;
                    b = __tco_b;
                };
                return __tco_result;
            };
        };
    };
};
var euclideanRingNumber = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingNumber;
}, function (v) {
    return 1;
}, $foreign.numDiv, function (v) {
    return function (v1) {
        return 0.0;
    };
});
var euclideanRingInt = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingInt;
}, $foreign.intDegree, $foreign.intDiv, $foreign.intMod);
var div = function (dict) {
    return dict.div;
};
var lcm = function (dictEq) {
    return function (dictEuclideanRing) {
        return function (a) {
            return function (b) {
                var $8 = Data_Eq.eq(dictEq)(a)(Data_Semiring.zero(((dictEuclideanRing.CommutativeRing0()).Ring0()).Semiring0())) || Data_Eq.eq(dictEq)(b)(Data_Semiring.zero(((dictEuclideanRing.CommutativeRing0()).Ring0()).Semiring0()));
                if ($8) {
                    return Data_Semiring.zero(((dictEuclideanRing.CommutativeRing0()).Ring0()).Semiring0());
                };
                return div(dictEuclideanRing)(Data_Semiring.mul(((dictEuclideanRing.CommutativeRing0()).Ring0()).Semiring0())(a)(b))(gcd(dictEq)(dictEuclideanRing)(a)(b));
            };
        };
    };
};
var degree = function (dict) {
    return dict.degree;
};
module.exports = {
    EuclideanRing: EuclideanRing, 
    degree: degree, 
    div: div, 
    gcd: gcd, 
    lcm: lcm, 
    mod: mod, 
    euclideanRingInt: euclideanRingInt, 
    euclideanRingNumber: euclideanRingNumber
};

},{"../Data.BooleanAlgebra":85,"../Data.CommutativeRing":88,"../Data.Eq":92,"../Data.HeytingAlgebra":111,"../Data.Ring":139,"../Data.Semiring":143,"./foreign":93}],95:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Field = function (EuclideanRing0) {
    this.EuclideanRing0 = EuclideanRing0;
};
var fieldNumber = new Field(function () {
    return Data_EuclideanRing.euclideanRingNumber;
});
module.exports = {
    Field: Field, 
    fieldNumber: fieldNumber
};

},{"../Data.CommutativeRing":88,"../Data.EuclideanRing":94,"../Data.Ring":139,"../Data.Semiring":143}],96:[function(require,module,exports){
"use strict";

exports.foldrArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = len - 1; i >= 0; i--) {
        acc = f(xs[i])(acc);
      }
      return acc;
    };
  };
};

exports.foldlArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = 0; i < len; i++) {
        acc = f(acc)(xs[i]);
      }
      return acc;
    };
  };
};

},{}],97:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Foldable = function (foldMap, foldl, foldr) {
    this.foldMap = foldMap;
    this.foldl = foldl;
    this.foldr = foldr;
};
var foldr = function (dict) {
    return dict.foldr;
};
var $$null = function (dictFoldable) {
    return foldr(dictFoldable)(function (v) {
        return function (v1) {
            return false;
        };
    })(true);
};
var oneOf = function (dictFoldable) {
    return function (dictPlus) {
        return foldr(dictFoldable)(Control_Alt.alt(dictPlus.Alt0()))(Control_Plus.empty(dictPlus));
    };
};
var traverse_ = function (dictApplicative) {
    return function (dictFoldable) {
        return function (f) {
            return foldr(dictFoldable)(function ($178) {
                return Control_Apply.applySecond(dictApplicative.Apply0())(f($178));
            })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
        };
    };
};
var for_ = function (dictApplicative) {
    return function (dictFoldable) {
        return Data_Function.flip(traverse_(dictApplicative)(dictFoldable));
    };
};
var sequence_ = function (dictApplicative) {
    return function (dictFoldable) {
        return traverse_(dictApplicative)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var foldl = function (dict) {
    return dict.foldl;
};
var intercalate = function (dictFoldable) {
    return function (dictMonoid) {
        return function (sep) {
            return function (xs) {
                var go = function (v) {
                    return function (x) {
                        if (v.init) {
                            return {
                                init: false, 
                                acc: x
                            };
                        };
                        return {
                            init: false, 
                            acc: Data_Semigroup.append(dictMonoid.Semigroup0())(v.acc)(Data_Semigroup.append(dictMonoid.Semigroup0())(sep)(x))
                        };
                    };
                };
                return (foldl(dictFoldable)(go)({
                    init: true, 
                    acc: Data_Monoid.mempty(dictMonoid)
                })(xs)).acc;
            };
        };
    };
};
var length = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(function (c) {
            return function (v) {
                return Data_Semiring.add(dictSemiring)(Data_Semiring.one(dictSemiring))(c);
            };
        })(Data_Semiring.zero(dictSemiring));
    };
};
var maximumBy = function (dictFoldable) {
    return function (cmp) {
        var max$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $101 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.GT.value);
                        if ($101) {
                            return v.value0;
                        };
                        return v1;
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 296, column 3 - line 296, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(max$prime)(Data_Maybe.Nothing.value);
    };
};
var maximum = function (dictOrd) {
    return function (dictFoldable) {
        return maximumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var minimumBy = function (dictFoldable) {
    return function (cmp) {
        var min$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $105 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.LT.value);
                        if ($105) {
                            return v.value0;
                        };
                        return v1;
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 309, column 3 - line 309, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(min$prime)(Data_Maybe.Nothing.value);
    };
};
var minimum = function (dictOrd) {
    return function (dictFoldable) {
        return minimumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var product = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.mul(dictSemiring))(Data_Semiring.one(dictSemiring));
    };
};
var sum = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.add(dictSemiring))(Data_Semiring.zero(dictSemiring));
    };
};
var foldableMultiplicative = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableMaybe = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Data_Maybe.Nothing) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Data_Maybe.Just) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 130, column 3 - line 130, column 30: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 128, column 3 - line 128, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Foldable line 126, column 3 - line 126, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var foldableDual = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableDisj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableConj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableAdditive = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldMapDefaultR = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return foldr(dictFoldable)(function (x) {
                return function (acc) {
                    return Data_Semigroup.append(dictMonoid.Semigroup0())(f(x))(acc);
                };
            })(Data_Monoid.mempty(dictMonoid));
        };
    };
};
var foldableArray = new Foldable(function (dictMonoid) {
    return foldMapDefaultR(foldableArray)(dictMonoid);
}, $foreign.foldlArray, $foreign.foldrArray);
var foldMapDefaultL = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return foldl(dictFoldable)(function (acc) {
                return function (x) {
                    return Data_Semigroup.append(dictMonoid.Semigroup0())(f(x))(acc);
                };
            })(Data_Monoid.mempty(dictMonoid));
        };
    };
};
var foldMap = function (dict) {
    return dict.foldMap;
};
var foldableFirst = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldableLast = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldlDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(Data_Newtype.unwrap(Data_Monoid_Dual.newtypeDual)(foldMap(dictFoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($179) {
                    return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(c)($179)));
                })(xs)))(u);
            };
        };
    };
};
var foldrDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Newtype.unwrap(Data_Monoid_Endo.newtypeEndo)(foldMap(dictFoldable)(Data_Monoid_Endo.monoidEndo)(function ($180) {
                    return Data_Monoid_Endo.Endo(c($180));
                })(xs))(u);
            };
        };
    };
};
var fold = function (dictFoldable) {
    return function (dictMonoid) {
        return foldMap(dictFoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn));
    };
};
var findMap = function (dictFoldable) {
    return function (p) {
        var go = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return p(v1);
                };
                return v;
            };
        };
        return foldl(dictFoldable)(go)(Data_Maybe.Nothing.value);
    };
};
var find = function (dictFoldable) {
    return function (p) {
        var go = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing && p(v1)) {
                    return new Data_Maybe.Just(v1);
                };
                return v;
            };
        };
        return foldl(dictFoldable)(go)(Data_Maybe.Nothing.value);
    };
};
var any = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return Data_Newtype.alaF(Data_Functor.functorFn)(Data_Functor.functorFn)(Data_Monoid_Disj.newtypeDisj)(Data_Monoid_Disj.newtypeDisj)(Data_Monoid_Disj.Disj)(foldMap(dictFoldable)(Data_Monoid_Disj.monoidDisj(dictHeytingAlgebra)));
    };
};
var elem = function (dictFoldable) {
    return function (dictEq) {
        return function ($181) {
            return any(dictFoldable)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Eq.eq(dictEq)($181));
        };
    };
};
var notElem = function (dictFoldable) {
    return function (dictEq) {
        return function (x) {
            return function ($182) {
                return !elem(dictFoldable)(dictEq)(x)($182);
            };
        };
    };
};
var or = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return any(dictFoldable)(dictHeytingAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
var all = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return Data_Newtype.alaF(Data_Functor.functorFn)(Data_Functor.functorFn)(Data_Monoid_Conj.newtypeConj)(Data_Monoid_Conj.newtypeConj)(Data_Monoid_Conj.Conj)(foldMap(dictFoldable)(Data_Monoid_Conj.monoidConj(dictHeytingAlgebra)));
    };
};
var and = function (dictFoldable) {
    return function (dictHeytingAlgebra) {
        return all(dictFoldable)(dictHeytingAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Foldable: Foldable, 
    all: all, 
    and: and, 
    any: any, 
    elem: elem, 
    find: find, 
    findMap: findMap, 
    fold: fold, 
    foldMap: foldMap, 
    foldMapDefaultL: foldMapDefaultL, 
    foldMapDefaultR: foldMapDefaultR, 
    foldl: foldl, 
    foldlDefault: foldlDefault, 
    foldr: foldr, 
    foldrDefault: foldrDefault, 
    for_: for_, 
    intercalate: intercalate, 
    length: length, 
    maximum: maximum, 
    maximumBy: maximumBy, 
    minimum: minimum, 
    minimumBy: minimumBy, 
    notElem: notElem, 
    "null": $$null, 
    oneOf: oneOf, 
    or: or, 
    product: product, 
    sequence_: sequence_, 
    sum: sum, 
    traverse_: traverse_, 
    foldableArray: foldableArray, 
    foldableMaybe: foldableMaybe, 
    foldableFirst: foldableFirst, 
    foldableLast: foldableLast, 
    foldableAdditive: foldableAdditive, 
    foldableDual: foldableDual, 
    foldableDisj: foldableDisj, 
    foldableConj: foldableConj, 
    foldableMultiplicative: foldableMultiplicative
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Eq":92,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Maybe":122,"../Data.Maybe.First":120,"../Data.Maybe.Last":121,"../Data.Monoid":129,"../Data.Monoid.Additive":123,"../Data.Monoid.Conj":124,"../Data.Monoid.Disj":125,"../Data.Monoid.Dual":126,"../Data.Monoid.Endo":127,"../Data.Monoid.Multiplicative":128,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Unit":157,"../Prelude":168,"./foreign":96}],98:[function(require,module,exports){
"use strict";

exports.toForeign = function (value) {
  return value;
};

exports.unsafeFromForeign = function (value) {
  return value;
};

exports.typeOf = function (value) {
  return typeof value;
};

exports.tagOf = function (value) {
  return Object.prototype.toString.call(value).slice(8, -1);
};

exports.isNull = function (value) {
  return value === null;
};

exports.isUndefined = function (value) {
  return value === undefined;
};

exports.isArray = Array.isArray || function (value) {
  return Object.prototype.toString.call(value) === "[object Array]";
};

},{}],99:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Except = require("../Control.Monad.Except");
var Control_Monad_Except_Trans = require("../Control.Monad.Except.Trans");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Boolean = require("../Data.Boolean");
var Data_Either = require("../Data.Either");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Identity = require("../Data.Identity");
var Data_Int = require("../Data.Int");
var Data_List_NonEmpty = require("../Data.List.NonEmpty");
var Data_Maybe = require("../Data.Maybe");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_String = require("../Data.String");
var Prelude = require("../Prelude");
var ForeignError = (function () {
    function ForeignError(value0) {
        this.value0 = value0;
    };
    ForeignError.create = function (value0) {
        return new ForeignError(value0);
    };
    return ForeignError;
})();
var TypeMismatch = (function () {
    function TypeMismatch(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    TypeMismatch.create = function (value0) {
        return function (value1) {
            return new TypeMismatch(value0, value1);
        };
    };
    return TypeMismatch;
})();
var ErrorAtIndex = (function () {
    function ErrorAtIndex(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    ErrorAtIndex.create = function (value0) {
        return function (value1) {
            return new ErrorAtIndex(value0, value1);
        };
    };
    return ErrorAtIndex;
})();
var ErrorAtProperty = (function () {
    function ErrorAtProperty(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    ErrorAtProperty.create = function (value0) {
        return function (value1) {
            return new ErrorAtProperty(value0, value1);
        };
    };
    return ErrorAtProperty;
})();
var JSONError = (function () {
    function JSONError(value0) {
        this.value0 = value0;
    };
    JSONError.create = function (value0) {
        return new JSONError(value0);
    };
    return JSONError;
})();
var showForeignError = new Data_Show.Show(function (v) {
    if (v instanceof ForeignError) {
        return "(ForeignError " + (v.value0 + ")");
    };
    if (v instanceof ErrorAtIndex) {
        return "(ErrorAtIndex " + (Data_Show.show(Data_Show.showInt)(v.value0) + (" " + (Data_Show.show(showForeignError)(v.value1) + ")")));
    };
    if (v instanceof ErrorAtProperty) {
        return "(ErrorAtProperty " + (Data_Show.show(Data_Show.showString)(v.value0) + (" " + (Data_Show.show(showForeignError)(v.value1) + ")")));
    };
    if (v instanceof JSONError) {
        return "(JSONError " + (Data_Show.show(Data_Show.showString)(v.value0) + ")");
    };
    if (v instanceof TypeMismatch) {
        return "(TypeMismatch " + (Data_Show.show(Data_Show.showString)(v.value0) + (" " + (Data_Show.show(Data_Show.showString)(v.value1) + ")")));
    };
    throw new Error("Failed pattern match at Data.Foreign line 65, column 3 - line 66, column 3: " + [ v.constructor.name ]);
});
var renderForeignError = function (v) {
    if (v instanceof ForeignError) {
        return v.value0;
    };
    if (v instanceof ErrorAtIndex) {
        return "Error at array index " + (Data_Show.show(Data_Show.showInt)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
    };
    if (v instanceof ErrorAtProperty) {
        return "Error at property " + (Data_Show.show(Data_Show.showString)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
    };
    if (v instanceof JSONError) {
        return "JSON error: " + v.value0;
    };
    if (v instanceof TypeMismatch) {
        return "Type mismatch: expected " + (v.value0 + (", found " + v.value1));
    };
    throw new Error("Failed pattern match at Data.Foreign line 75, column 1 - line 75, column 44: " + [ v.constructor.name ]);
};
var readUndefined = function (value) {
    if ($foreign.isUndefined(value)) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(Data_Maybe.Nothing.value);
    };
    if (Data_Boolean.otherwise) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(new Data_Maybe.Just(value));
    };
    throw new Error("Failed pattern match at Data.Foreign line 156, column 1 - line 158, column 34: " + [ value.constructor.name ]);
};
var readNullOrUndefined = function (value) {
    if ($foreign.isNull(value) || $foreign.isUndefined(value)) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(Data_Maybe.Nothing.value);
    };
    if (Data_Boolean.otherwise) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(new Data_Maybe.Just(value));
    };
    throw new Error("Failed pattern match at Data.Foreign line 161, column 1 - line 163, column 34: " + [ value.constructor.name ]);
};
var readNull = function (value) {
    if ($foreign.isNull(value)) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(Data_Maybe.Nothing.value);
    };
    if (Data_Boolean.otherwise) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))(new Data_Maybe.Just(value));
    };
    throw new Error("Failed pattern match at Data.Foreign line 151, column 1 - line 153, column 34: " + [ value.constructor.name ]);
};
var fail = function ($115) {
    return Control_Monad_Error_Class.throwError(Control_Monad_Except_Trans.monadThrowExceptT(Data_Identity.monadIdentity))(Data_List_NonEmpty.singleton($115));
};
var readArray = function (value) {
    if ($foreign.isArray(value)) {
        return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))($foreign.unsafeFromForeign(value));
    };
    if (Data_Boolean.otherwise) {
        return fail(new TypeMismatch("array", $foreign.tagOf(value)));
    };
    throw new Error("Failed pattern match at Data.Foreign line 146, column 1 - line 148, column 58: " + [ value.constructor.name ]);
};
var unsafeReadTagged = function (tag) {
    return function (value) {
        if ($foreign.tagOf(value) === tag) {
            return Control_Applicative.pure(Control_Monad_Except_Trans.applicativeExceptT(Data_Identity.monadIdentity))($foreign.unsafeFromForeign(value));
        };
        if (Data_Boolean.otherwise) {
            return fail(new TypeMismatch(tag, $foreign.tagOf(value)));
        };
        throw new Error("Failed pattern match at Data.Foreign line 105, column 1 - line 107, column 54: " + [ tag.constructor.name, value.constructor.name ]);
    };
};
var readBoolean = unsafeReadTagged("Boolean");
var readNumber = unsafeReadTagged("Number");
var readInt = function (value) {
    var error = Data_Either.Left.create(Data_List_NonEmpty.singleton(new TypeMismatch("Int", $foreign.tagOf(value))));
    var fromNumber = function ($116) {
        return Data_Maybe.maybe(error)(Control_Applicative.pure(Data_Either.applicativeEither))(Data_Int.fromNumber($116));
    };
    return Control_Monad_Except.mapExcept(Data_Either.either(Data_Function["const"](error))(fromNumber))(readNumber(value));
};
var readString = unsafeReadTagged("String");
var readChar = function (value) {
    var error = Data_Either.Left.create(Data_List_NonEmpty.singleton(new TypeMismatch("Char", $foreign.tagOf(value))));
    var fromString = function ($117) {
        return Data_Maybe.maybe(error)(Control_Applicative.pure(Data_Either.applicativeEither))(Data_String.toChar($117));
    };
    return Control_Monad_Except.mapExcept(Data_Either.either(Data_Function["const"](error))(fromString))(readString(value));
};
var eqForeignError = new Data_Eq.Eq(function (x) {
    return function (y) {
        if (x instanceof ForeignError && y instanceof ForeignError) {
            return x.value0 === y.value0;
        };
        if (x instanceof TypeMismatch && y instanceof TypeMismatch) {
            return x.value0 === y.value0 && x.value1 === y.value1;
        };
        if (x instanceof ErrorAtIndex && y instanceof ErrorAtIndex) {
            return x.value0 === y.value0 && Data_Eq.eq(eqForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtProperty && y instanceof ErrorAtProperty) {
            return x.value0 === y.value0 && Data_Eq.eq(eqForeignError)(x.value1)(y.value1);
        };
        if (x instanceof JSONError && y instanceof JSONError) {
            return x.value0 === y.value0;
        };
        return false;
    };
});
var ordForeignError = new Data_Ord.Ord(function () {
    return eqForeignError;
}, function (x) {
    return function (y) {
        if (x instanceof ForeignError && y instanceof ForeignError) {
            return Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
        };
        if (x instanceof ForeignError) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof ForeignError) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof TypeMismatch && y instanceof TypeMismatch) {
            var $86 = Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
            if ($86 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($86 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(Data_Ord.ordString)(x.value1)(y.value1);
        };
        if (x instanceof TypeMismatch) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof TypeMismatch) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof ErrorAtIndex && y instanceof ErrorAtIndex) {
            var $95 = Data_Ord.compare(Data_Ord.ordInt)(x.value0)(y.value0);
            if ($95 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($95 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(ordForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtIndex) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof ErrorAtIndex) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof ErrorAtProperty && y instanceof ErrorAtProperty) {
            var $104 = Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
            if ($104 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($104 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(ordForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtProperty) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof ErrorAtProperty) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof JSONError && y instanceof JSONError) {
            return Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
        };
        throw new Error("Failed pattern match: " + [ x.constructor.name, y.constructor.name ]);
    };
});
module.exports = {
    ForeignError: ForeignError, 
    TypeMismatch: TypeMismatch, 
    ErrorAtIndex: ErrorAtIndex, 
    ErrorAtProperty: ErrorAtProperty, 
    JSONError: JSONError, 
    fail: fail, 
    readArray: readArray, 
    readBoolean: readBoolean, 
    readChar: readChar, 
    readInt: readInt, 
    readNull: readNull, 
    readNullOrUndefined: readNullOrUndefined, 
    readNumber: readNumber, 
    readString: readString, 
    readUndefined: readUndefined, 
    renderForeignError: renderForeignError, 
    unsafeReadTagged: unsafeReadTagged, 
    eqForeignError: eqForeignError, 
    ordForeignError: ordForeignError, 
    showForeignError: showForeignError, 
    isArray: $foreign.isArray, 
    isNull: $foreign.isNull, 
    isUndefined: $foreign.isUndefined, 
    tagOf: $foreign.tagOf, 
    toForeign: $foreign.toForeign, 
    typeOf: $foreign.typeOf, 
    unsafeFromForeign: $foreign.unsafeFromForeign
};

},{"../Control.Applicative":14,"../Control.Monad.Error.Class":48,"../Control.Monad.Except":50,"../Control.Monad.Except.Trans":49,"../Control.Semigroupoid":67,"../Data.Boolean":84,"../Data.Either":90,"../Data.Eq":92,"../Data.Function":102,"../Data.HeytingAlgebra":111,"../Data.Identity":112,"../Data.Int":116,"../Data.List.NonEmpty":117,"../Data.Maybe":122,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Show":145,"../Data.String":149,"../Prelude":168,"./foreign":98}],100:[function(require,module,exports){
"use strict";

// module Data.Function.Uncurried

exports.mkFn0 = function (fn) {
  return function () {
    return fn({});
  };
};

exports.mkFn2 = function (fn) {
  /* jshint maxparams: 2 */
  return function (a, b) {
    return fn(a)(b);
  };
};

exports.mkFn3 = function (fn) {
  /* jshint maxparams: 3 */
  return function (a, b, c) {
    return fn(a)(b)(c);
  };
};

exports.mkFn4 = function (fn) {
  /* jshint maxparams: 4 */
  return function (a, b, c, d) {
    return fn(a)(b)(c)(d);
  };
};

exports.mkFn5 = function (fn) {
  /* jshint maxparams: 5 */
  return function (a, b, c, d, e) {
    return fn(a)(b)(c)(d)(e);
  };
};

exports.mkFn6 = function (fn) {
  /* jshint maxparams: 6 */
  return function (a, b, c, d, e, f) {
    return fn(a)(b)(c)(d)(e)(f);
  };
};

exports.mkFn7 = function (fn) {
  /* jshint maxparams: 7 */
  return function (a, b, c, d, e, f, g) {
    return fn(a)(b)(c)(d)(e)(f)(g);
  };
};

exports.mkFn8 = function (fn) {
  /* jshint maxparams: 8 */
  return function (a, b, c, d, e, f, g, h) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h);
  };
};

exports.mkFn9 = function (fn) {
  /* jshint maxparams: 9 */
  return function (a, b, c, d, e, f, g, h, i) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i);
  };
};

exports.mkFn10 = function (fn) {
  /* jshint maxparams: 10 */
  return function (a, b, c, d, e, f, g, h, i, j) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i)(j);
  };
};

exports.runFn0 = function (fn) {
  return fn();
};

exports.runFn2 = function (fn) {
  return function (a) {
    return function (b) {
      return fn(a, b);
    };
  };
};

exports.runFn3 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return fn(a, b, c);
      };
    };
  };
};

exports.runFn4 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return fn(a, b, c, d);
        };
      };
    };
  };
};

exports.runFn5 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return fn(a, b, c, d, e);
          };
        };
      };
    };
  };
};

exports.runFn6 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return fn(a, b, c, d, e, f);
            };
          };
        };
      };
    };
  };
};

exports.runFn7 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return fn(a, b, c, d, e, f, g);
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn8 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return fn(a, b, c, d, e, f, g, h);
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn9 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return fn(a, b, c, d, e, f, g, h, i);
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn10 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return function (j) {
                      return fn(a, b, c, d, e, f, g, h, i, j);
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

},{}],101:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var runFn1 = function (f) {
    return f;
};
var mkFn1 = function (f) {
    return f;
};
module.exports = {
    mkFn1: mkFn1, 
    runFn1: runFn1, 
    mkFn0: $foreign.mkFn0, 
    mkFn10: $foreign.mkFn10, 
    mkFn2: $foreign.mkFn2, 
    mkFn3: $foreign.mkFn3, 
    mkFn4: $foreign.mkFn4, 
    mkFn5: $foreign.mkFn5, 
    mkFn6: $foreign.mkFn6, 
    mkFn7: $foreign.mkFn7, 
    mkFn8: $foreign.mkFn8, 
    mkFn9: $foreign.mkFn9, 
    runFn0: $foreign.runFn0, 
    runFn10: $foreign.runFn10, 
    runFn2: $foreign.runFn2, 
    runFn3: $foreign.runFn3, 
    runFn4: $foreign.runFn4, 
    runFn5: $foreign.runFn5, 
    runFn6: $foreign.runFn6, 
    runFn7: $foreign.runFn7, 
    runFn8: $foreign.runFn8, 
    runFn9: $foreign.runFn9
};

},{"../Data.Unit":157,"./foreign":100}],102:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var on = function (f) {
    return function (g) {
        return function (x) {
            return function (y) {
                return f(g(x))(g(y));
            };
        };
    };
};
var flip = function (f) {
    return function (b) {
        return function (a) {
            return f(a)(b);
        };
    };
};
var $$const = function (a) {
    return function (v) {
        return a;
    };
};
var applyFlipped = function (x) {
    return function (f) {
        return f(x);
    };
};
var apply = function (f) {
    return function (x) {
        return f(x);
    };
};
module.exports = {
    apply: apply, 
    applyFlipped: applyFlipped, 
    "const": $$const, 
    flip: flip, 
    on: on
};

},{"../Control.Category":21}],103:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad = require("../Control.Monad");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_Plus = require("../Control.Plus");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var Unsafe_Coerce = require("../Unsafe.Coerce");
var App = function (x) {
    return x;
};
var traversableApp = function (dictTraversable) {
    return dictTraversable;
};
var showApp = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(App " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var plusApp = function (dictPlus) {
    return dictPlus;
};
var newtypeApp = new Data_Newtype.Newtype(function (n) {
    return n;
}, App);
var monadPlusApp = function (dictMonadPlus) {
    return dictMonadPlus;
};
var monadApp = function (dictMonad) {
    return dictMonad;
};
var lazyApp = function (dictLazy) {
    return dictLazy;
};
var hoistLowerApp = Unsafe_Coerce.unsafeCoerce;
var hoistLiftApp = Unsafe_Coerce.unsafeCoerce;
var hoistApp = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorApp = function (dictFunctor) {
    return dictFunctor;
};
var foldableApp = function (dictFoldable) {
    return dictFoldable;
};
var extendApp = function (dictExtend) {
    return dictExtend;
};
var eq1App = function (dictEq1) {
    return new Data_Eq.Eq1(function (dictEq) {
        return function (v) {
            return function (v1) {
                return Data_Eq.eq1(dictEq1)(dictEq)(v)(v1);
            };
        };
    });
};
var eqApp = function (dictEq1) {
    return function (dictEq) {
        return new Data_Eq.Eq(Data_Eq.eq1(eq1App(dictEq1))(dictEq));
    };
};
var ord1App = function (dictOrd1) {
    return new Data_Ord.Ord1(function () {
        return eq1App(dictOrd1.Eq10());
    }, function (dictOrd) {
        return function (v) {
            return function (v1) {
                return Data_Ord.compare1(dictOrd1)(dictOrd)(v)(v1);
            };
        };
    });
};
var ordApp = function (dictOrd1) {
    return function (dictOrd) {
        return new Data_Ord.Ord(function () {
            return eqApp(dictOrd1.Eq10())(dictOrd.Eq0());
        }, Data_Ord.compare1(ord1App(dictOrd1))(dictOrd));
    };
};
var comonadApp = function (dictComonad) {
    return dictComonad;
};
var bindApp = function (dictBind) {
    return dictBind;
};
var applyApp = function (dictApply) {
    return dictApply;
};
var applicativeApp = function (dictApplicative) {
    return dictApplicative;
};
var alternativeApp = function (dictAlternative) {
    return dictAlternative;
};
var altApp = function (dictAlt) {
    return dictAlt;
};
module.exports = {
    App: App, 
    hoistApp: hoistApp, 
    hoistLiftApp: hoistLiftApp, 
    hoistLowerApp: hoistLowerApp, 
    newtypeApp: newtypeApp, 
    eqApp: eqApp, 
    eq1App: eq1App, 
    ordApp: ordApp, 
    ord1App: ord1App, 
    showApp: showApp, 
    functorApp: functorApp, 
    applyApp: applyApp, 
    applicativeApp: applicativeApp, 
    bindApp: bindApp, 
    monadApp: monadApp, 
    altApp: altApp, 
    plusApp: plusApp, 
    alternativeApp: alternativeApp, 
    monadPlusApp: monadPlusApp, 
    lazyApp: lazyApp, 
    foldableApp: foldableApp, 
    traversableApp: traversableApp, 
    extendApp: extendApp, 
    comonadApp: comonadApp
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Lazy":26,"../Control.Monad":61,"../Control.MonadPlus":62,"../Control.Plus":66,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Functor":107,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Data.Traversable":152,"../Prelude":168,"../Unsafe.Coerce":171}],104:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_App = require("../Data.Functor.App");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var Compose = function (x) {
    return x;
};
var showCompose = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Compose " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var newtypeCompose = new Data_Newtype.Newtype(function (n) {
    return n;
}, Compose);
var functorCompose = function (dictFunctor) {
    return function (dictFunctor1) {
        return new Data_Functor.Functor(function (f) {
            return function (v) {
                return Compose(Data_Functor.map(dictFunctor)(Data_Functor.map(dictFunctor1)(f))(v));
            };
        });
    };
};
var foldableCompose = function (dictFoldable) {
    return function (dictFoldable1) {
        return new Data_Foldable.Foldable(function (dictMonoid) {
            return function (f) {
                return function (v) {
                    return Data_Foldable.foldMap(dictFoldable)(dictMonoid)(Data_Foldable.foldMap(dictFoldable1)(dictMonoid)(f))(v);
                };
            };
        }, function (f) {
            return function (i) {
                return function (v) {
                    return Data_Foldable.foldl(dictFoldable)(Data_Foldable.foldl(dictFoldable1)(f))(i)(v);
                };
            };
        }, function (f) {
            return function (i) {
                return function (v) {
                    return Data_Foldable.foldr(dictFoldable)(Data_Function.flip(Data_Foldable.foldr(dictFoldable1)(f)))(i)(v);
                };
            };
        });
    };
};
var traversableCompose = function (dictTraversable) {
    return function (dictTraversable1) {
        return new Data_Traversable.Traversable(function () {
            return foldableCompose(dictTraversable.Foldable1())(dictTraversable1.Foldable1());
        }, function () {
            return functorCompose(dictTraversable.Functor0())(dictTraversable1.Functor0());
        }, function (dictApplicative) {
            return Data_Traversable.traverse(traversableCompose(dictTraversable)(dictTraversable1))(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
        }, function (dictApplicative) {
            return function (f) {
                return function (v) {
                    return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Compose)(Data_Traversable.traverse(dictTraversable)(dictApplicative)(Data_Traversable.traverse(dictTraversable1)(dictApplicative)(f))(v));
                };
            };
        });
    };
};
var eq1Compose = function (dictEq1) {
    return function (dictEq11) {
        return new Data_Eq.Eq1(function (dictEq) {
            return function (v) {
                return function (v1) {
                    return Data_Eq.eq1(dictEq1)(Data_Functor_App.eqApp(dictEq11)(dictEq))(Data_Functor_App.hoistLiftApp(v))(Data_Functor_App.hoistLiftApp(v1));
                };
            };
        });
    };
};
var eqCompose = function (dictEq1) {
    return function (dictEq11) {
        return function (dictEq) {
            return new Data_Eq.Eq(Data_Eq.eq1(eq1Compose(dictEq1)(dictEq11))(dictEq));
        };
    };
};
var ord1Compose = function (dictOrd1) {
    return function (dictOrd11) {
        return new Data_Ord.Ord1(function () {
            return eq1Compose(dictOrd1.Eq10())(dictOrd11.Eq10());
        }, function (dictOrd) {
            return function (v) {
                return function (v1) {
                    return Data_Ord.compare1(dictOrd1)(Data_Functor_App.ordApp(dictOrd11)(dictOrd))(Data_Functor_App.hoistLiftApp(v))(Data_Functor_App.hoistLiftApp(v1));
                };
            };
        });
    };
};
var ordCompose = function (dictOrd1) {
    return function (dictOrd11) {
        return function (dictOrd) {
            return new Data_Ord.Ord(function () {
                return eqCompose(dictOrd1.Eq10())(dictOrd11.Eq10())(dictOrd.Eq0());
            }, Data_Ord.compare1(ord1Compose(dictOrd1)(dictOrd11))(dictOrd));
        };
    };
};
var bihoistCompose = function (dictFunctor) {
    return function (natF) {
        return function (natG) {
            return function (v) {
                return natF(Data_Functor.map(dictFunctor)(natG)(v));
            };
        };
    };
};
var applyCompose = function (dictApply) {
    return function (dictApply1) {
        return new Control_Apply.Apply(function () {
            return functorCompose(dictApply.Functor0())(dictApply1.Functor0());
        }, function (v) {
            return function (v1) {
                return Compose(Control_Apply.apply(dictApply)(Data_Functor.map(dictApply.Functor0())(Control_Apply.apply(dictApply1))(v))(v1));
            };
        });
    };
};
var applicativeCompose = function (dictApplicative) {
    return function (dictApplicative1) {
        return new Control_Applicative.Applicative(function () {
            return applyCompose(dictApplicative.Apply0())(dictApplicative1.Apply0());
        }, function ($75) {
            return Compose(Control_Applicative.pure(dictApplicative)(Control_Applicative.pure(dictApplicative1)($75)));
        });
    };
};
var altCompose = function (dictAlt) {
    return function (dictFunctor) {
        return new Control_Alt.Alt(function () {
            return functorCompose(dictAlt.Functor0())(dictFunctor);
        }, function (v) {
            return function (v1) {
                return Compose(Control_Alt.alt(dictAlt)(v)(v1));
            };
        });
    };
};
var plusCompose = function (dictPlus) {
    return function (dictFunctor) {
        return new Control_Plus.Plus(function () {
            return altCompose(dictPlus.Alt0())(dictFunctor);
        }, Control_Plus.empty(dictPlus));
    };
};
var alternativeCompose = function (dictAlternative) {
    return function (dictApplicative) {
        return new Control_Alternative.Alternative(function () {
            return applicativeCompose(dictAlternative.Applicative0())(dictApplicative);
        }, function () {
            return plusCompose(dictAlternative.Plus1())((dictApplicative.Apply0()).Functor0());
        });
    };
};
module.exports = {
    Compose: Compose, 
    bihoistCompose: bihoistCompose, 
    newtypeCompose: newtypeCompose, 
    eq1Compose: eq1Compose, 
    eqCompose: eqCompose, 
    ord1Compose: ord1Compose, 
    ordCompose: ordCompose, 
    showCompose: showCompose, 
    functorCompose: functorCompose, 
    applyCompose: applyCompose, 
    applicativeCompose: applicativeCompose, 
    foldableCompose: foldableCompose, 
    traversableCompose: traversableCompose, 
    altCompose: altCompose, 
    plusCompose: plusCompose, 
    alternativeCompose: alternativeCompose
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.Functor.App":103,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Data.Traversable":152,"../Prelude":168}],105:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Functor = require("../Data.Functor");
var Invariant = function (imap) {
    this.imap = imap;
};
var imapF = function (dictFunctor) {
    return function (f) {
        return function (v) {
            return Data_Functor.map(dictFunctor)(f);
        };
    };
};
var invariantArray = new Invariant(imapF(Data_Functor.functorArray));
var invariantFn = new Invariant(imapF(Data_Functor.functorFn));
var imap = function (dict) {
    return dict.imap;
};
module.exports = {
    Invariant: Invariant, 
    imap: imap, 
    imapF: imapF, 
    invariantFn: invariantFn, 
    invariantArray: invariantArray
};

},{"../Data.Functor":107}],106:[function(require,module,exports){
"use strict";

exports.arrayMap = function (f) {
  return function (arr) {
    var l = arr.length;
    var result = new Array(l);
    for (var i = 0; i < l; i++) {
      result[i] = f(arr[i]);
    }
    return result;
  };
};

},{}],107:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Functor = function (map) {
    this.map = map;
};
var map = function (dict) {
    return dict.map;
};
var mapFlipped = function (dictFunctor) {
    return function (fa) {
        return function (f) {
            return map(dictFunctor)(f)(fa);
        };
    };
};
var $$void = function (dictFunctor) {
    return map(dictFunctor)(Data_Function["const"](Data_Unit.unit));
};
var voidLeft = function (dictFunctor) {
    return function (f) {
        return function (x) {
            return map(dictFunctor)(Data_Function["const"](x))(f);
        };
    };
};
var voidRight = function (dictFunctor) {
    return function (x) {
        return map(dictFunctor)(Data_Function["const"](x));
    };
};
var functorFn = new Functor(Control_Semigroupoid.compose(Control_Semigroupoid.semigroupoidFn));
var functorArray = new Functor($foreign.arrayMap);
var flap = function (dictFunctor) {
    return function (ff) {
        return function (x) {
            return map(dictFunctor)(function (f) {
                return f(x);
            })(ff);
        };
    };
};
module.exports = {
    Functor: Functor, 
    flap: flap, 
    map: map, 
    mapFlipped: mapFlipped, 
    "void": $$void, 
    voidLeft: voidLeft, 
    voidRight: voidRight, 
    functorFn: functorFn, 
    functorArray: functorArray
};

},{"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Unit":157,"./foreign":106}],108:[function(require,module,exports){
"use strict";

// module Data.Generic

exports.zipAll = function (f) {
  return function (xs) {
    return function (ys) {
      var l = xs.length < ys.length ? xs.length : ys.length;
      for (var i = 0; i < l; i++) {
        if (!f(xs[i])(ys[i])) {
          return false;
        }
      }
      return true;
    };
  };
};

exports.zipCompare = function (f) {
  return function (xs) {
    return function (ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var o = f(xs[i])(ys[i]);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

},{}],109:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Array = require("../Data.Array");
var Data_Boolean = require("../Data.Boolean");
var Data_Either = require("../Data.Either");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Identity = require("../Data.Identity");
var Data_List_Types = require("../Data.List.Types");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_String = require("../Data.String");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Prelude = require("../Prelude");
var Type_Proxy = require("../Type.Proxy");
var SProd = (function () {
    function SProd(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    SProd.create = function (value0) {
        return function (value1) {
            return new SProd(value0, value1);
        };
    };
    return SProd;
})();
var SRecord = (function () {
    function SRecord(value0) {
        this.value0 = value0;
    };
    SRecord.create = function (value0) {
        return new SRecord(value0);
    };
    return SRecord;
})();
var SNumber = (function () {
    function SNumber(value0) {
        this.value0 = value0;
    };
    SNumber.create = function (value0) {
        return new SNumber(value0);
    };
    return SNumber;
})();
var SBoolean = (function () {
    function SBoolean(value0) {
        this.value0 = value0;
    };
    SBoolean.create = function (value0) {
        return new SBoolean(value0);
    };
    return SBoolean;
})();
var SInt = (function () {
    function SInt(value0) {
        this.value0 = value0;
    };
    SInt.create = function (value0) {
        return new SInt(value0);
    };
    return SInt;
})();
var SString = (function () {
    function SString(value0) {
        this.value0 = value0;
    };
    SString.create = function (value0) {
        return new SString(value0);
    };
    return SString;
})();
var SChar = (function () {
    function SChar(value0) {
        this.value0 = value0;
    };
    SChar.create = function (value0) {
        return new SChar(value0);
    };
    return SChar;
})();
var SArray = (function () {
    function SArray(value0) {
        this.value0 = value0;
    };
    SArray.create = function (value0) {
        return new SArray(value0);
    };
    return SArray;
})();
var SUnit = (function () {
    function SUnit() {

    };
    SUnit.value = new SUnit();
    return SUnit;
})();
var SigProd = (function () {
    function SigProd(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    SigProd.create = function (value0) {
        return function (value1) {
            return new SigProd(value0, value1);
        };
    };
    return SigProd;
})();
var SigRecord = (function () {
    function SigRecord(value0) {
        this.value0 = value0;
    };
    SigRecord.create = function (value0) {
        return new SigRecord(value0);
    };
    return SigRecord;
})();
var SigNumber = (function () {
    function SigNumber() {

    };
    SigNumber.value = new SigNumber();
    return SigNumber;
})();
var SigBoolean = (function () {
    function SigBoolean() {

    };
    SigBoolean.value = new SigBoolean();
    return SigBoolean;
})();
var SigInt = (function () {
    function SigInt() {

    };
    SigInt.value = new SigInt();
    return SigInt;
})();
var SigString = (function () {
    function SigString() {

    };
    SigString.value = new SigString();
    return SigString;
})();
var SigChar = (function () {
    function SigChar() {

    };
    SigChar.value = new SigChar();
    return SigChar;
})();
var SigArray = (function () {
    function SigArray(value0) {
        this.value0 = value0;
    };
    SigArray.create = function (value0) {
        return new SigArray(value0);
    };
    return SigArray;
})();
var SigUnit = (function () {
    function SigUnit() {

    };
    SigUnit.value = new SigUnit();
    return SigUnit;
})();
var Generic = function (fromSpine, toSignature, toSpine) {
    this.fromSpine = fromSpine;
    this.toSignature = toSignature;
    this.toSpine = toSpine;
};
var toSpine = function (dict) {
    return dict.toSpine;
};
var toSignature = function (dict) {
    return dict.toSignature;
};
var showSuspended = function (dictShow) {
    return function (e) {
        return "\\_ -> " + Data_Show.show(dictShow)(e(Data_Unit.unit));
    };
};
var showArray = function (v) {
    return function (v1) {
        if (v1.length === 0) {
            return "[]";
        };
        return "[ " + (Data_Foldable.intercalate(Data_Foldable.foldableArray)(Data_Monoid.monoidString)(", ")(Data_Functor.map(Data_Functor.functorArray)(v)(v1)) + " ]");
    };
};
var showGenericSpine = new Data_Show.Show(function (v) {
    if (v instanceof SUnit) {
        return "SUnit";
    };
    if (v instanceof SChar) {
        return "SChar " + Data_Show.show(Data_Show.showChar)(v.value0);
    };
    if (v instanceof SString) {
        return "SString " + Data_Show.show(Data_Show.showString)(v.value0);
    };
    if (v instanceof SBoolean) {
        return "SBoolean " + Data_Show.show(Data_Show.showBoolean)(v.value0);
    };
    if (v instanceof SNumber) {
        return "SNumber " + Data_Show.show(Data_Show.showNumber)(v.value0);
    };
    if (v instanceof SInt) {
        return "SInt " + Data_Show.show(Data_Show.showInt)(v.value0);
    };
    if (v instanceof SArray) {
        return "SArray " + showArray(showSuspended(showGenericSpine))(v.value0);
    };
    if (v instanceof SProd) {
        return "SProd " + (Data_Show.show(Data_Show.showString)(v.value0) + (" " + showArray(showSuspended(showGenericSpine))(v.value1)));
    };
    if (v instanceof SRecord) {
        var showElt = function (v1) {
            return Data_Foldable.fold(Data_Foldable.foldableArray)(Data_Monoid.monoidString)([ "{ recLabel: ", Data_Show.show(Data_Show.showString)(v1.recLabel), ", recValue: ", showSuspended(showGenericSpine)(v1.recValue), " }" ]);
        };
        return "SRecord " + showArray(showElt)(v.value0);
    };
    throw new Error("Failed pattern match at Data.Generic line 272, column 9 - line 273, column 9: " + [ v.constructor.name ]);
});
var orderingToInt = function (v) {
    if (v instanceof Data_Ordering.EQ) {
        return 0;
    };
    if (v instanceof Data_Ordering.LT) {
        return 1;
    };
    if (v instanceof Data_Ordering.GT) {
        return -1 | 0;
    };
    throw new Error("Failed pattern match at Data.Generic line 538, column 17 - line 541, column 10: " + [ v.constructor.name ]);
};
var genericVoid = new Generic(function (v) {
    return Data_Maybe.Nothing.value;
}, function (v) {
    return new SigProd("Data.Void.Void", [  ]);
}, Data_Void.absurd);
var genericUnit = new Generic(function (v) {
    if (v instanceof SUnit) {
        return new Data_Maybe.Just(Data_Unit.unit);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigUnit.value;
}, function (v) {
    return SUnit.value;
});
var genericString = new Generic(function (v) {
    if (v instanceof SString) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigString.value;
}, SString.create);
var genericOrdering = new Generic(function (v) {
    if (v instanceof SProd && (v.value0 === "Data.Ordering.LT" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.LT.value);
    };
    if (v instanceof SProd && (v.value0 === "Data.Ordering.EQ" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.EQ.value);
    };
    if (v instanceof SProd && (v.value0 === "Data.Ordering.GT" && v.value1.length === 0)) {
        return new Data_Maybe.Just(Data_Ordering.GT.value);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return new SigProd("Data.Ordering.Ordering", [ {
        sigConstructor: "Data.Ordering.LT", 
        sigValues: [  ]
    }, {
        sigConstructor: "Data.Ordering.EQ", 
        sigValues: [  ]
    }, {
        sigConstructor: "Data.Ordering.GT", 
        sigValues: [  ]
    } ]);
}, function (v) {
    if (v instanceof Data_Ordering.LT) {
        return new SProd("Data.Ordering.LT", [  ]);
    };
    if (v instanceof Data_Ordering.EQ) {
        return new SProd("Data.Ordering.EQ", [  ]);
    };
    if (v instanceof Data_Ordering.GT) {
        return new SProd("Data.Ordering.GT", [  ]);
    };
    throw new Error("Failed pattern match at Data.Generic line 218, column 13 - line 221, column 38: " + [ v.constructor.name ]);
});
var genericNumber = new Generic(function (v) {
    if (v instanceof SNumber) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigNumber.value;
}, SNumber.create);
var genericInt = new Generic(function (v) {
    if (v instanceof SInt) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigInt.value;
}, SInt.create);
var genericChar = new Generic(function (v) {
    if (v instanceof SChar) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigChar.value;
}, SChar.create);
var genericBool = new Generic(function (v) {
    if (v instanceof SBoolean) {
        return new Data_Maybe.Just(v.value0);
    };
    return Data_Maybe.Nothing.value;
}, function (v) {
    return SigBoolean.value;
}, SBoolean.create);
var fromSpine = function (dict) {
    return dict.fromSpine;
};
var force = function (f) {
    return f(Data_Unit.unit);
};
var genericArray = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SArray) {
            return Data_Traversable.traverse(Data_Traversable.traversableArray)(Data_Maybe.applicativeMaybe)(function ($332) {
                return fromSpine(dictGeneric)(force($332));
            })(v.value0);
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var lowerProxy = function (v) {
            return Type_Proxy["Proxy"].value;
        };
        return new SigArray(function (v) {
            return toSignature(dictGeneric)(lowerProxy(x));
        });
    }, function ($333) {
        return SArray.create(Data_Functor.map(Data_Functor.functorArray)(function (x) {
            return function (v) {
                return toSpine(dictGeneric)(x);
            };
        })($333));
    });
};
var genericEither = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.Either.Left" && v.value1.length === 1)) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Either.Left.create)(fromSpine(dictGeneric)(force(v["value1"][0])));
            };
            if (v instanceof SProd && (v.value0 === "Data.Either.Right" && v.value1.length === 1)) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Either.Right.create)(fromSpine(dictGeneric1)(force(v["value1"][0])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var rproxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            var lproxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            return new SigProd("Data.Either.Either", [ {
                sigConstructor: "Data.Either.Left", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric)(lproxy(x));
                } ]
            }, {
                sigConstructor: "Data.Either.Right", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric1)(rproxy(x));
                } ]
            } ]);
        }, function (v) {
            if (v instanceof Data_Either.Left) {
                return new SProd("Data.Either.Left", [ function (v1) {
                    return toSpine(dictGeneric)(v.value0);
                } ]);
            };
            if (v instanceof Data_Either.Right) {
                return new SProd("Data.Either.Right", [ function (v1) {
                    return toSpine(dictGeneric1)(v.value0);
                } ]);
            };
            throw new Error("Failed pattern match at Data.Generic line 181, column 3 - line 181, column 64: " + [ v.constructor.name ]);
        });
    };
};
var genericIdentity = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.Identity.Identity" && v.value1.length === 1)) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Identity.Identity)(fromSpine(dictGeneric)(force(v["value1"][0])));
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var iproxy = function (v) {
            return Type_Proxy["Proxy"].value;
        };
        return new SigProd("Data.Identity.Identity", [ {
            sigConstructor: "Data.Identity.Identity", 
            sigValues: [ function (v) {
                return toSignature(dictGeneric)(iproxy(x));
            } ]
        } ]);
    }, function (v) {
        return new SProd("Data.Identity.Identity", [ function (v1) {
            return toSpine(dictGeneric)(v);
        } ]);
    });
};
var genericList = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.List.Types.Cons" && v.value1.length === 2)) {
            return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(Data_List_Types.Cons.create)(fromSpine(dictGeneric)(force(v["value1"][0]))))(fromSpine(genericList(dictGeneric))(force(v["value1"][1])));
        };
        if (v instanceof SProd && (v.value0 === "Data.List.Types.Nil" && v.value1.length === 0)) {
            return Control_Applicative.pure(Data_Maybe.applicativeMaybe)(Data_List_Types.Nil.value);
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var headProxy = function (v) {
            return Type_Proxy["Proxy"].value;
        };
        return new SigProd("Data.List.Types.List", [ {
            sigConstructor: "Data.List.Types.Cons", 
            sigValues: [ function (v) {
                return toSignature(dictGeneric)(headProxy(x));
            }, function (v) {
                return toSignature(genericList(dictGeneric))(x);
            } ]
        }, {
            sigConstructor: "Data.List.Types.Nil", 
            sigValues: [  ]
        } ]);
    }, function (v) {
        if (v instanceof Data_List_Types.Cons) {
            return new SProd("Data.List.Types.Cons", [ function (v1) {
                return toSpine(dictGeneric)(v.value0);
            }, function (v1) {
                return toSpine(genericList(dictGeneric))(v.value1);
            } ]);
        };
        if (v instanceof Data_List_Types.Nil) {
            return new SProd("Data.List.Types.Nil", [  ]);
        };
        throw new Error("Failed pattern match at Data.Generic line 117, column 3 - line 118, column 68: " + [ v.constructor.name ]);
    });
};
var genericMaybe = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.Maybe.Just" && v.value1.length === 1)) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Maybe.Just.create)(fromSpine(dictGeneric)(force(v["value1"][0])));
        };
        if (v instanceof SProd && (v.value0 === "Data.Maybe.Nothing" && v.value1.length === 0)) {
            return Control_Applicative.pure(Data_Maybe.applicativeMaybe)(Data_Maybe.Nothing.value);
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var mbProxy = function (v) {
            return Type_Proxy["Proxy"].value;
        };
        return new SigProd("Data.Maybe.Maybe", [ {
            sigConstructor: "Data.Maybe.Just", 
            sigValues: [ function (v) {
                return toSignature(dictGeneric)(mbProxy(x));
            } ]
        }, {
            sigConstructor: "Data.Maybe.Nothing", 
            sigValues: [  ]
        } ]);
    }, function (v) {
        if (v instanceof Data_Maybe.Just) {
            return new SProd("Data.Maybe.Just", [ function (v1) {
                return toSpine(dictGeneric)(v.value0);
            } ]);
        };
        if (v instanceof Data_Maybe.Nothing) {
            return new SProd("Data.Maybe.Nothing", [  ]);
        };
        throw new Error("Failed pattern match at Data.Generic line 161, column 3 - line 161, column 63: " + [ v.constructor.name ]);
    });
};
var genericNonEmpty = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.NonEmpty.NonEmpty" && v.value1.length === 2)) {
                return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(Data_NonEmpty.NonEmpty.create)(fromSpine(dictGeneric1)(force(v["value1"][0]))))(fromSpine(dictGeneric)(force(v["value1"][1])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var tailProxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            var headProxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            return new SigProd("Data.NonEmpty.NonEmpty", [ {
                sigConstructor: "Data.NonEmpty.NonEmpty", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric1)(headProxy(x));
                }, function (v) {
                    return toSignature(dictGeneric)(tailProxy(x));
                } ]
            } ]);
        }, function (v) {
            return new SProd("Data.NonEmpty.NonEmpty", [ function (v1) {
                return toSpine(dictGeneric1)(v.value0);
            }, function (v1) {
                return toSpine(dictGeneric)(v.value1);
            } ]);
        });
    };
};
var genericNonEmptyList = function (dictGeneric) {
    return new Generic(function (v) {
        if (v instanceof SProd && (v.value0 === "Data.List.Types.NonEmptyList" && v.value1.length === 1)) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(Data_List_Types.NonEmptyList)(fromSpine(genericNonEmpty(genericList(dictGeneric))(dictGeneric))(force(v["value1"][0])));
        };
        return Data_Maybe.Nothing.value;
    }, function (x) {
        var listProxy = function (v) {
            return Type_Proxy["Proxy"].value;
        };
        return new SigProd("Data.List.Types.NonEmptyList", [ {
            sigConstructor: "Data.List.Types.NonEmptyList", 
            sigValues: [ function (v) {
                return toSignature(genericList(dictGeneric))(listProxy(x));
            } ]
        } ]);
    }, function (v) {
        return new SProd("Data.List.Types.NonEmptyList", [ function (v1) {
            return toSpine(genericNonEmpty(genericList(dictGeneric))(dictGeneric))(v);
        } ]);
    });
};
var genericShowPrec = function (v) {
    return function (v1) {
        if (v1 instanceof SProd) {
            if (Data_Array["null"](v1.value1)) {
                return v1.value0;
            };
            if (Data_Boolean.otherwise) {
                var showParen = function (v2) {
                    return function (x) {
                        if (!v2) {
                            return x;
                        };
                        if (v2) {
                            return "(" + (x + ")");
                        };
                        throw new Error("Failed pattern match at Data.Generic line 467, column 7 - line 467, column 28: " + [ v2.constructor.name, x.constructor.name ]);
                    };
                };
                return showParen(v > 10)(v1.value0 + (" " + Data_String.joinWith(" ")(Data_Functor.map(Data_Functor.functorArray)(function (x) {
                    return genericShowPrec(11)(force(x));
                })(v1.value1))));
            };
        };
        if (v1 instanceof SRecord) {
            var showLabelPart = function (x) {
                return x.recLabel + (": " + genericShowPrec(0)(force(x.recValue)));
            };
            return "{" + (Data_String.joinWith(", ")(Data_Functor.map(Data_Functor.functorArray)(showLabelPart)(v1.value0)) + "}");
        };
        if (v1 instanceof SBoolean) {
            return Data_Show.show(Data_Show.showBoolean)(v1.value0);
        };
        if (v1 instanceof SInt) {
            return Data_Show.show(Data_Show.showInt)(v1.value0);
        };
        if (v1 instanceof SNumber) {
            return Data_Show.show(Data_Show.showNumber)(v1.value0);
        };
        if (v1 instanceof SString) {
            return Data_Show.show(Data_Show.showString)(v1.value0);
        };
        if (v1 instanceof SChar) {
            return Data_Show.show(Data_Show.showChar)(v1.value0);
        };
        if (v1 instanceof SArray) {
            return "[" + (Data_String.joinWith(", ")(Data_Functor.map(Data_Functor.functorArray)(function (x) {
                return genericShowPrec(0)(force(x));
            })(v1.value0)) + "]");
        };
        if (v1 instanceof SUnit) {
            return "unit";
        };
        throw new Error("Failed pattern match at Data.Generic line 461, column 1 - line 469, column 1: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var gShow = function (dictGeneric) {
    return function ($334) {
        return genericShowPrec(0)(toSpine(dictGeneric)($334));
    };
};
var genericTuple = function (dictGeneric) {
    return function (dictGeneric1) {
        return new Generic(function (v) {
            if (v instanceof SProd && (v.value0 === "Data.Tuple.Tuple" && v.value1.length === 2)) {
                return Control_Apply.apply(Data_Maybe.applyMaybe)(Data_Functor.map(Data_Maybe.functorMaybe)(Data_Tuple.Tuple.create)(fromSpine(dictGeneric)(force(v["value1"][0]))))(fromSpine(dictGeneric1)(force(v["value1"][1])));
            };
            return Data_Maybe.Nothing.value;
        }, function (x) {
            var sndProxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            var fstProxy = function (v) {
                return Type_Proxy["Proxy"].value;
            };
            return new SigProd("Data.Tuple.Tuple", [ {
                sigConstructor: "Data.Tuple.Tuple", 
                sigValues: [ function (v) {
                    return toSignature(dictGeneric)(fstProxy(x));
                }, function (v) {
                    return toSignature(dictGeneric1)(sndProxy(x));
                } ]
            } ]);
        }, function (v) {
            return new SProd("Data.Tuple.Tuple", [ function (v1) {
                return toSpine(dictGeneric)(v.value0);
            }, function (v1) {
                return toSpine(dictGeneric1)(v.value1);
            } ]);
        });
    };
};
var isValidSpine = function (v) {
    return function (v1) {
        if (v instanceof SigBoolean && v1 instanceof SBoolean) {
            return true;
        };
        if (v instanceof SigNumber && v1 instanceof SNumber) {
            return true;
        };
        if (v instanceof SigInt && v1 instanceof SInt) {
            return true;
        };
        if (v instanceof SigString && v1 instanceof SString) {
            return true;
        };
        if (v instanceof SigChar && v1 instanceof SChar) {
            return true;
        };
        if (v instanceof SigArray && v1 instanceof SArray) {
            return Data_Foldable.all(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(function ($335) {
                return isValidSpine(force(v.value0))(force($335));
            })(v1.value0);
        };
        if (v instanceof SigProd && v1 instanceof SProd) {
            var v2 = Data_Foldable.find(Data_Foldable.foldableArray)(function (alt) {
                return alt.sigConstructor === v1.value0;
            })(v.value1);
            if (v2 instanceof Data_Maybe.Nothing) {
                return false;
            };
            if (v2 instanceof Data_Maybe.Just) {
                return Data_Foldable.and(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Array.zipWith(function (sig) {
                    return function (spine) {
                        return isValidSpine(force(sig))(force(spine));
                    };
                })(v2.value0.sigValues)(v1.value1));
            };
            throw new Error("Failed pattern match at Data.Generic line 438, column 3 - line 444, column 15: " + [ v2.constructor.name ]);
        };
        if (v instanceof SigRecord && v1 instanceof SRecord) {
            return Data_Foldable.and(Data_Foldable.foldableArray)(Data_HeytingAlgebra.heytingAlgebraBoolean)(Data_Array.zipWith(function (sig) {
                return function (val) {
                    return isValidSpine(force(sig.recValue))(force(val.recValue));
                };
            })(Data_Array.sortBy(function (a) {
                return function (b) {
                    return Data_Ord.compare(Data_Ord.ordString)(a.recLabel)(b.recLabel);
                };
            })(v.value0))(Data_Array.sortBy(function (a) {
                return function (b) {
                    return Data_Ord.compare(Data_Ord.ordString)(a.recLabel)(b.recLabel);
                };
            })(v1.value0)));
        };
        if (v instanceof SigUnit && v1 instanceof SUnit) {
            return true;
        };
        return false;
    };
};
var showSignature = function (sig) {
    var needsParen = function (s) {
        if (s instanceof SigProd) {
            return true;
        };
        if (s instanceof SigRecord) {
            return true;
        };
        if (s instanceof SigNumber) {
            return false;
        };
        if (s instanceof SigBoolean) {
            return false;
        };
        if (s instanceof SigInt) {
            return false;
        };
        if (s instanceof SigString) {
            return false;
        };
        if (s instanceof SigChar) {
            return false;
        };
        if (s instanceof SigArray) {
            return true;
        };
        if (s instanceof SigUnit) {
            return false;
        };
        throw new Error("Failed pattern match at Data.Generic line 403, column 18 - line 412, column 21: " + [ s.constructor.name ]);
    };
    var paren = function (s) {
        if (needsParen(s)) {
            return "(" + (showSignature(s) + ")");
        };
        if (Data_Boolean.otherwise) {
            return showSignature(s);
        };
        throw new Error("Failed pattern match at Data.Generic line 386, column 3 - line 412, column 21: " + [ s.constructor.name ]);
    };
    return Data_Foldable.fold(Data_Foldable.foldableArray)(Data_Monoid.monoidString)((function () {
        if (sig instanceof SigProd) {
            return [ "SigProd ", Data_Show.show(Data_Show.showString)(sig.value0), " ", showArray(showDataConstructor)(sig.value1) ];
        };
        if (sig instanceof SigRecord) {
            return [ "SigRecord ", showArray(showLabel)(sig.value0) ];
        };
        if (sig instanceof SigNumber) {
            return [ "SigNumber" ];
        };
        if (sig instanceof SigBoolean) {
            return [ "SigBoolean" ];
        };
        if (sig instanceof SigInt) {
            return [ "SigInt" ];
        };
        if (sig instanceof SigString) {
            return [ "SigString" ];
        };
        if (sig instanceof SigChar) {
            return [ "SigChar" ];
        };
        if (sig instanceof SigArray) {
            return [ "SigArray ", paren(force(sig.value0)) ];
        };
        if (sig instanceof SigUnit) {
            return [ "SigUnit" ];
        };
        throw new Error("Failed pattern match at Data.Generic line 386, column 10 - line 396, column 27: " + [ sig.constructor.name ]);
    })());
};
var showLabel = function (l) {
    return "{ recLabel: " + (Data_Show.show(Data_Show.showString)(l.recLabel) + (", recValue: " + (showSignature(force(l.recValue)) + " }")));
};
var showDataConstructor = function (dc) {
    return "{ sigConstructor: " + (Data_Show.show(Data_Show.showString)(dc.sigConstructor) + (", sigValues: " + (showArray(function ($336) {
        return showSignature(force($336));
    })(dc.sigValues) + " }")));
};
var showGenericSignature = new Data_Show.Show(showSignature);
var eqThunk = function (dictEq) {
    return function (x) {
        return function (y) {
            return Data_Eq.eq(dictEq)(force(x))(force(y));
        };
    };
};
var eqRecordSigs = function (dictEq) {
    return function (arr1) {
        return function (arr2) {
            var labelCompare = function (r1) {
                return function (r2) {
                    return Data_Ord.compare(Data_Ord.ordString)(r1.recLabel)(r2.recLabel);
                };
            };
            var sorted1 = Data_Array.sortBy(labelCompare)(arr1);
            var sorted2 = Data_Array.sortBy(labelCompare)(arr2);
            var doCmp = function (x) {
                return function (y) {
                    return x.recLabel === y.recLabel && Data_Eq.eq(dictEq)(force(x.recValue))(force(y.recValue));
                };
            };
            return Data_Array.length(arr1) === Data_Array.length(arr2) && $foreign.zipAll(doCmp)(sorted1)(sorted2);
        };
    };
};
var eqGenericSpine = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof SProd && v1 instanceof SProd) {
            return v.value0 === v1.value0 && (Data_Array.length(v.value1) === Data_Array.length(v1.value1) && $foreign.zipAll(eqThunk(eqGenericSpine))(v.value1)(v1.value1));
        };
        if (v instanceof SRecord && v1 instanceof SRecord) {
            return eqRecordSigs(eqGenericSpine)(v.value0)(v1.value0);
        };
        if (v instanceof SNumber && v1 instanceof SNumber) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SBoolean && v1 instanceof SBoolean) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SInt && v1 instanceof SInt) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SString && v1 instanceof SString) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SChar && v1 instanceof SChar) {
            return v.value0 === v1.value0;
        };
        if (v instanceof SArray && v1 instanceof SArray) {
            return Data_Array.length(v.value0) === Data_Array.length(v1.value0) && $foreign.zipAll(eqThunk(eqGenericSpine))(v.value0)(v1.value0);
        };
        if (v instanceof SUnit && v1 instanceof SUnit) {
            return true;
        };
        return false;
    };
});
var gEq = function (dictGeneric) {
    return function (x) {
        return function (y) {
            return Data_Eq.eq(eqGenericSpine)(toSpine(dictGeneric)(x))(toSpine(dictGeneric)(y));
        };
    };
};
var eqGenericSignature = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof SigProd && v1 instanceof SigProd) {
            return v.value0 === v1.value0 && (Data_Array.length(v.value1) === Data_Array.length(v1.value1) && $foreign.zipAll(eqDataConstructor)(v.value1)(v1.value1));
        };
        if (v instanceof SigRecord && v1 instanceof SigRecord) {
            return eqRecordSigs(eqGenericSignature)(v.value0)(v1.value0);
        };
        if (v instanceof SigNumber && v1 instanceof SigNumber) {
            return true;
        };
        if (v instanceof SigBoolean && v1 instanceof SigBoolean) {
            return true;
        };
        if (v instanceof SigInt && v1 instanceof SigInt) {
            return true;
        };
        if (v instanceof SigString && v1 instanceof SigString) {
            return true;
        };
        if (v instanceof SigChar && v1 instanceof SigChar) {
            return true;
        };
        if (v instanceof SigArray && v1 instanceof SigArray) {
            return eqThunk(eqGenericSignature)(v.value0)(v1.value0);
        };
        if (v instanceof SigUnit && v1 instanceof SigUnit) {
            return true;
        };
        return false;
    };
});
var eqDataConstructor = function (p1) {
    return function (p2) {
        return p1.sigConstructor === p2.sigConstructor && $foreign.zipAll(eqThunk(eqGenericSignature))(p1.sigValues)(p2.sigValues);
    };
};
var compareThunk = function (dictOrd) {
    return function (x) {
        return function (y) {
            return orderingToInt(Data_Ord.compare(dictOrd)(force(x))(force(y)));
        };
    };
};
var ordGenericSpine = new Data_Ord.Ord(function () {
    return eqGenericSpine;
}, function (v) {
    return function (v1) {
        if (v instanceof SProd && v1 instanceof SProd) {
            var v2 = Data_Ord.compare(Data_Ord.ordString)(v.value0)(v1.value0);
            if (v2 instanceof Data_Ordering.EQ) {
                return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(compareThunk(ordGenericSpine))(v.value1)(v1.value1));
            };
            return v2;
        };
        if (v instanceof SProd) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SProd) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SRecord && v1 instanceof SRecord) {
            var go = function (x) {
                return function (y) {
                    var v2 = Data_Ord.compare(Data_Ord.ordString)(x.recLabel)(y.recLabel);
                    if (v2 instanceof Data_Ordering.EQ) {
                        return orderingToInt(Data_Ord.compare(ordGenericSpine)(force(x.recValue))(force(y.recValue)));
                    };
                    return orderingToInt(v2);
                };
            };
            return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(go)(v.value0)(v1.value0));
        };
        if (v instanceof SRecord) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SRecord) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SInt && v1 instanceof SInt) {
            return Data_Ord.compare(Data_Ord.ordInt)(v.value0)(v1.value0);
        };
        if (v instanceof SInt) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SInt) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SBoolean && v1 instanceof SBoolean) {
            return Data_Ord.compare(Data_Ord.ordBoolean)(v.value0)(v1.value0);
        };
        if (v instanceof SBoolean) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SBoolean) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SNumber && v1 instanceof SNumber) {
            return Data_Ord.compare(Data_Ord.ordNumber)(v.value0)(v1.value0);
        };
        if (v instanceof SNumber) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SNumber) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SString && v1 instanceof SString) {
            return Data_Ord.compare(Data_Ord.ordString)(v.value0)(v1.value0);
        };
        if (v instanceof SString) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SString) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SChar && v1 instanceof SChar) {
            return Data_Ord.compare(Data_Ord.ordChar)(v.value0)(v1.value0);
        };
        if (v instanceof SChar) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SChar) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SArray && v1 instanceof SArray) {
            return Data_Ord.compare(Data_Ord.ordInt)(0)($foreign.zipCompare(compareThunk(ordGenericSpine))(v.value0)(v1.value0));
        };
        if (v instanceof SArray) {
            return Data_Ordering.LT.value;
        };
        if (v1 instanceof SArray) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof SUnit && v1 instanceof SUnit) {
            return Data_Ordering.EQ.value;
        };
        throw new Error("Failed pattern match at Data.Generic line 304, column 3 - line 307, column 15: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var gCompare = function (dictGeneric) {
    return function (x) {
        return function (y) {
            return Data_Ord.compare(ordGenericSpine)(toSpine(dictGeneric)(x))(toSpine(dictGeneric)(y));
        };
    };
};
module.exports = {
    SigProd: SigProd, 
    SigRecord: SigRecord, 
    SigNumber: SigNumber, 
    SigBoolean: SigBoolean, 
    SigInt: SigInt, 
    SigString: SigString, 
    SigChar: SigChar, 
    SigArray: SigArray, 
    SigUnit: SigUnit, 
    SProd: SProd, 
    SRecord: SRecord, 
    SNumber: SNumber, 
    SBoolean: SBoolean, 
    SInt: SInt, 
    SString: SString, 
    SChar: SChar, 
    SArray: SArray, 
    SUnit: SUnit, 
    Generic: Generic, 
    fromSpine: fromSpine, 
    gCompare: gCompare, 
    gEq: gEq, 
    gShow: gShow, 
    isValidSpine: isValidSpine, 
    showDataConstructor: showDataConstructor, 
    showSignature: showSignature, 
    toSignature: toSignature, 
    toSpine: toSpine, 
    genericNumber: genericNumber, 
    genericInt: genericInt, 
    genericString: genericString, 
    genericChar: genericChar, 
    genericBool: genericBool, 
    genericArray: genericArray, 
    genericUnit: genericUnit, 
    genericVoid: genericVoid, 
    genericTuple: genericTuple, 
    genericList: genericList, 
    genericNonEmptyList: genericNonEmptyList, 
    genericMaybe: genericMaybe, 
    genericEither: genericEither, 
    genericIdentity: genericIdentity, 
    genericOrdering: genericOrdering, 
    genericNonEmpty: genericNonEmpty, 
    showGenericSpine: showGenericSpine, 
    eqGenericSpine: eqGenericSpine, 
    ordGenericSpine: ordGenericSpine, 
    eqGenericSignature: eqGenericSignature, 
    showGenericSignature: showGenericSignature
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Semigroupoid":67,"../Data.Array":75,"../Data.Boolean":84,"../Data.Either":90,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Identity":112,"../Data.List.Types":118,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.NonEmpty":132,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Show":145,"../Data.String":149,"../Data.Traversable":152,"../Data.Tuple":153,"../Data.Unit":157,"../Data.Void":158,"../Prelude":168,"../Type.Proxy":169,"./foreign":108}],110:[function(require,module,exports){
"use strict";

exports.boolConj = function (b1) {
  return function (b2) {
    return b1 && b2;
  };
};

exports.boolDisj = function (b1) {
  return function (b2) {
    return b1 || b2;
  };
};

exports.boolNot = function (b) {
  return !b;
};

},{}],111:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var HeytingAlgebra = function (conj, disj, ff, implies, not, tt) {
    this.conj = conj;
    this.disj = disj;
    this.ff = ff;
    this.implies = implies;
    this.not = not;
    this.tt = tt;
};
var tt = function (dict) {
    return dict.tt;
};
var not = function (dict) {
    return dict.not;
};
var implies = function (dict) {
    return dict.implies;
};
var heytingAlgebraUnit = new HeytingAlgebra(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return Data_Unit.unit;
}, Data_Unit.unit);
var ff = function (dict) {
    return dict.ff;
};
var disj = function (dict) {
    return dict.disj;
};
var heytingAlgebraBoolean = new HeytingAlgebra($foreign.boolConj, $foreign.boolDisj, false, function (a) {
    return function (b) {
        return disj(heytingAlgebraBoolean)(not(heytingAlgebraBoolean)(a))(b);
    };
}, $foreign.boolNot, true);
var conj = function (dict) {
    return dict.conj;
};
var heytingAlgebraFunction = function (dictHeytingAlgebra) {
    return new HeytingAlgebra(function (f) {
        return function (g) {
            return function (a) {
                return conj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (g) {
            return function (a) {
                return disj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (v) {
        return ff(dictHeytingAlgebra);
    }, function (f) {
        return function (g) {
            return function (a) {
                return implies(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (a) {
            return not(dictHeytingAlgebra)(f(a));
        };
    }, function (v) {
        return tt(dictHeytingAlgebra);
    });
};
module.exports = {
    HeytingAlgebra: HeytingAlgebra, 
    conj: conj, 
    disj: disj, 
    ff: ff, 
    implies: implies, 
    not: not, 
    tt: tt, 
    heytingAlgebraBoolean: heytingAlgebraBoolean, 
    heytingAlgebraUnit: heytingAlgebraUnit, 
    heytingAlgebraFunction: heytingAlgebraFunction
};

},{"../Data.Unit":157,"./foreign":110}],112:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad = require("../Control.Monad");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Field = require("../Data.Field");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var Identity = function (x) {
    return x;
};
var showIdentity = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Identity " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringIdentity = function (dictSemiring) {
    return dictSemiring;
};
var semigroupIdenity = function (dictSemigroup) {
    return dictSemigroup;
};
var ringIdentity = function (dictRing) {
    return dictRing;
};
var ordIdentity = function (dictOrd) {
    return dictOrd;
};
var newtypeIdentity = new Data_Newtype.Newtype(function (n) {
    return n;
}, Identity);
var monoidIdentity = function (dictMonoid) {
    return dictMonoid;
};
var lazyIdentity = function (dictLazy) {
    return dictLazy;
};
var heytingAlgebraIdentity = function (dictHeytingAlgebra) {
    return dictHeytingAlgebra;
};
var functorIdentity = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var invariantIdentity = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorIdentity));
var foldableIdentity = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var traversableIdentity = new Data_Traversable.Traversable(function () {
    return foldableIdentity;
}, function () {
    return functorIdentity;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Identity)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Identity)(f(v));
        };
    };
});
var fieldIdentity = function (dictField) {
    return dictField;
};
var extendIdentity = new Control_Extend.Extend(function () {
    return functorIdentity;
}, function (f) {
    return function (m) {
        return f(m);
    };
});
var euclideanRingIdentity = function (dictEuclideanRing) {
    return dictEuclideanRing;
};
var eqIdentity = function (dictEq) {
    return dictEq;
};
var comonadIdentity = new Control_Comonad.Comonad(function () {
    return extendIdentity;
}, function (v) {
    return v;
});
var commutativeRingIdentity = function (dictCommutativeRing) {
    return dictCommutativeRing;
};
var boundedIdentity = function (dictBounded) {
    return dictBounded;
};
var booleanAlgebraIdentity = function (dictBooleanAlgebra) {
    return dictBooleanAlgebra;
};
var applyIdentity = new Control_Apply.Apply(function () {
    return functorIdentity;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindIdentity = new Control_Bind.Bind(function () {
    return applyIdentity;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeIdentity = new Control_Applicative.Applicative(function () {
    return applyIdentity;
}, Identity);
var monadIdentity = new Control_Monad.Monad(function () {
    return applicativeIdentity;
}, function () {
    return bindIdentity;
});
var altIdentity = new Control_Alt.Alt(function () {
    return functorIdentity;
}, function (x) {
    return function (v) {
        return x;
    };
});
module.exports = {
    Identity: Identity, 
    newtypeIdentity: newtypeIdentity, 
    eqIdentity: eqIdentity, 
    ordIdentity: ordIdentity, 
    boundedIdentity: boundedIdentity, 
    heytingAlgebraIdentity: heytingAlgebraIdentity, 
    booleanAlgebraIdentity: booleanAlgebraIdentity, 
    semigroupIdenity: semigroupIdenity, 
    monoidIdentity: monoidIdentity, 
    semiringIdentity: semiringIdentity, 
    euclideanRingIdentity: euclideanRingIdentity, 
    ringIdentity: ringIdentity, 
    commutativeRingIdentity: commutativeRingIdentity, 
    fieldIdentity: fieldIdentity, 
    lazyIdentity: lazyIdentity, 
    showIdentity: showIdentity, 
    functorIdentity: functorIdentity, 
    invariantIdentity: invariantIdentity, 
    altIdentity: altIdentity, 
    applyIdentity: applyIdentity, 
    applicativeIdentity: applicativeIdentity, 
    bindIdentity: bindIdentity, 
    monadIdentity: monadIdentity, 
    extendIdentity: extendIdentity, 
    comonadIdentity: comonadIdentity, 
    foldableIdentity: foldableIdentity, 
    traversableIdentity: traversableIdentity
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Lazy":26,"../Control.Monad":61,"../Data.BooleanAlgebra":85,"../Data.Bounded":87,"../Data.CommutativeRing":88,"../Data.Eq":92,"../Data.EuclideanRing":94,"../Data.Field":95,"../Data.Foldable":97,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.HeytingAlgebra":111,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.Traversable":152,"../Prelude":168}],113:[function(require,module,exports){
"use strict";

// module Data.Int.Bits

exports.and = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 & n2;
  };
};

exports.or = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 | n2;
  };
};

exports.xor = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 ^ n2;
  };
};

exports.shl = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 << n2;
  };
};

exports.shr = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 >> n2;
  };
};

exports.zshr = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 >>> n2;
  };
};

exports.complement = function (n) {
  /* jshint bitwise: false */
  return ~n;
};

},{}],114:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
module.exports = {
    and: $foreign.and, 
    complement: $foreign.complement, 
    or: $foreign.or, 
    shl: $foreign.shl, 
    shr: $foreign.shr, 
    xor: $foreign.xor, 
    zshr: $foreign.zshr
};

},{"./foreign":113}],115:[function(require,module,exports){
"use strict";

// module Data.Int

exports.fromNumberImpl = function (just) {
  return function (nothing) {
    return function (n) {
      /* jshint bitwise: false */
      return (n | 0) === n ? just(n) : nothing;
    };
  };
};

exports.toNumber = function (n) {
  return n;
};

exports.fromStringAsImpl = function (just) {
  return function (nothing) {
    return function (radix) {
      var digits;
      if (radix < 11) {
        digits = "[0-" + (radix - 1).toString() + "]";
      } else if (radix === 11) {
        digits = "[0-9a]";
      } else {
        digits = "[0-9a-" + String.fromCharCode(86 + radix) + "]";
      }
      var pattern = new RegExp("^[\\+\\-]?" + digits + "+$", "i");

      return function (s) {
        /* jshint bitwise: false */
        if (pattern.test(s)) {
          var i = parseInt(s, radix);
          return (i | 0) === i ? just(i) : nothing;
        } else {
          return nothing;
        }
      };
    };
  };
};

exports.toStringAs = function (radix) {
  return function (i) {
    return i.toString(radix);
  };
};

exports.pow = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return Math.pow(x,y) | 0;
  };
};

},{}],116:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Boolean = require("../Data.Boolean");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Int_Bits = require("../Data.Int.Bits");
var Data_Maybe = require("../Data.Maybe");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Global = require("../Global");
var $$Math = require("../Math");
var Prelude = require("../Prelude");
var Radix = function (x) {
    return x;
};
var radix = function (n) {
    if (n >= 2 && n <= 36) {
        return new Data_Maybe.Just(n);
    };
    if (Data_Boolean.otherwise) {
        return Data_Maybe.Nothing.value;
    };
    throw new Error("Failed pattern match at Data.Int line 124, column 1 - line 125, column 38: " + [ n.constructor.name ]);
};
var odd = function (x) {
    return (x & 1) !== 0;
};
var octal = 8;
var hexadecimal = 16;
var fromStringAs = $foreign.fromStringAsImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var fromString = fromStringAs(10);
var fromNumber = $foreign.fromNumberImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var unsafeClamp = function (x) {
    if (x === Global.infinity) {
        return 0;
    };
    if (x === -Global.infinity) {
        return 0;
    };
    if (x >= $foreign.toNumber(Data_Bounded.top(Data_Bounded.boundedInt))) {
        return Data_Bounded.top(Data_Bounded.boundedInt);
    };
    if (x <= $foreign.toNumber(Data_Bounded.bottom(Data_Bounded.boundedInt))) {
        return Data_Bounded.bottom(Data_Bounded.boundedInt);
    };
    if (Data_Boolean.otherwise) {
        return Data_Maybe.fromMaybe(0)(fromNumber(x));
    };
    throw new Error("Failed pattern match at Data.Int line 63, column 1 - line 68, column 43: " + [ x.constructor.name ]);
};
var round = function ($2) {
    return unsafeClamp($$Math.round($2));
};
var floor = function ($3) {
    return unsafeClamp($$Math.floor($3));
};
var even = function (x) {
    return (x & 1) === 0;
};
var decimal = 10;
var ceil = function ($4) {
    return unsafeClamp($$Math.ceil($4));
};
var binary = 2;
var base36 = 36;
module.exports = {
    base36: base36, 
    binary: binary, 
    ceil: ceil, 
    decimal: decimal, 
    even: even, 
    floor: floor, 
    fromNumber: fromNumber, 
    fromString: fromString, 
    fromStringAs: fromStringAs, 
    hexadecimal: hexadecimal, 
    octal: octal, 
    odd: odd, 
    radix: radix, 
    round: round, 
    pow: $foreign.pow, 
    toNumber: $foreign.toNumber, 
    toStringAs: $foreign.toStringAs
};

},{"../Control.Semigroupoid":67,"../Data.Boolean":84,"../Data.Bounded":87,"../Data.Eq":92,"../Data.HeytingAlgebra":111,"../Data.Int.Bits":114,"../Data.Maybe":122,"../Data.Ord":136,"../Data.Ring":139,"../Global":160,"../Math":163,"../Prelude":168,"./foreign":115}],117:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Bind = require("../Control.Bind");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_List = require("../Data.List");
var Data_List_Types = require("../Data.List.Types");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Prelude = require("../Prelude");
var uncons = function (v) {
    return {
        head: v.value0, 
        tail: v.value1
    };
};
var toList = function (v) {
    return new Data_List_Types.Cons(v.value0, v.value1);
};
var toUnfoldable = function (dictUnfoldable) {
    return function ($41) {
        return Data_Unfoldable.unfoldr(dictUnfoldable)(function (xs) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(function (rec) {
                return new Data_Tuple.Tuple(rec.head, rec.tail);
            })(Data_List.uncons(xs));
        })(toList($41));
    };
};
var tail = function (v) {
    return v.value1;
};
var singleton = function ($42) {
    return Data_List_Types.NonEmptyList(Data_NonEmpty.singleton(Data_List_Types.plusList)($42));
};
var length = function (v) {
    return 1 + Data_List.length(v.value1) | 0;
};
var last = function (v) {
    return Data_Maybe.fromMaybe(v.value0)(Data_List.last(v.value1));
};
var init = function (v) {
    return Data_Maybe.maybe(Data_List_Types.Nil.value)(function (v1) {
        return new Data_List_Types.Cons(v.value0, v1);
    })(Data_List.init(v.value1));
};
var head = function (v) {
    return v.value0;
};
var fromList = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just(new Data_NonEmpty.NonEmpty(v.value0, v.value1));
    };
    throw new Error("Failed pattern match at Data.List.NonEmpty line 37, column 1 - line 37, column 25: " + [ v.constructor.name ]);
};
var fromFoldable = function (dictFoldable) {
    return function ($43) {
        return fromList(Data_List.fromFoldable(dictFoldable)($43));
    };
};
var concatMap = Data_Function.flip(Control_Bind.bind(Data_List_Types.bindNonEmptyList));
var appendFoldable = function (dictFoldable) {
    return function (v) {
        return function (ys) {
            return new Data_NonEmpty.NonEmpty(v.value0, Data_Semigroup.append(Data_List_Types.semigroupList)(v.value1)(Data_List.fromFoldable(dictFoldable)(ys)));
        };
    };
};
module.exports = {
    appendFoldable: appendFoldable, 
    concatMap: concatMap, 
    fromFoldable: fromFoldable, 
    fromList: fromList, 
    head: head, 
    init: init, 
    length: length, 
    singleton: singleton, 
    tail: tail, 
    toList: toList, 
    toUnfoldable: toUnfoldable, 
    uncons: uncons
};

},{"../Control.Bind":20,"../Control.Semigroupoid":67,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.List":119,"../Data.List.Types":118,"../Data.Maybe":122,"../Data.NonEmpty":132,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Tuple":153,"../Data.Unfoldable":155,"../Prelude":168}],118:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Prelude = require("../Prelude");
var Nil = (function () {
    function Nil() {

    };
    Nil.value = new Nil();
    return Nil;
})();
var Cons = (function () {
    function Cons(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Cons.create = function (value0) {
        return function (value1) {
            return new Cons(value0, value1);
        };
    };
    return Cons;
})();
var NonEmptyList = function (x) {
    return x;
};
var toList = function (v) {
    return new Cons(v.value0, v.value1);
};
var newtypeNonEmptyList = new Data_Newtype.Newtype(function (n) {
    return n;
}, NonEmptyList);
var foldableList = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return Data_Foldable.foldl(foldableList)(function (acc) {
            return function ($113) {
                return Data_Semigroup.append(dictMonoid.Semigroup0())(acc)(f($113));
            };
        })(Data_Monoid.mempty(dictMonoid));
    };
}, function (f) {
    var go = function (__copy_b) {
        return function (__copy_v) {
            var b = __copy_b;
            var v = __copy_v;
            var __tco_done = false;
            var __tco_result;
            var __tco_b;
            var __tco_v;
            function __tco_loop(b, v) {
                if (v instanceof Nil) {
                    __tco_done = true;
                    return b;
                };
                if (v instanceof Cons) {
                    __tco_b = f(b)(v.value0);
                    __tco_v = v.value1;
                    return;
                };
                throw new Error("Failed pattern match at Data.List.Types line 76, column 12 - line 78, column 30: " + [ v.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(b, v);
                b = __tco_b;
                v = __tco_v;
            };
            return __tco_result;
        };
    };
    return go;
}, function (f) {
    return function (b) {
        var rev = function (__copy_acc) {
            return function (__copy_v) {
                var acc = __copy_acc;
                var v = __copy_v;
                var __tco_done = false;
                var __tco_result;
                var __tco_acc;
                var __tco_v;
                function __tco_loop(acc, v) {
                    if (v instanceof Nil) {
                        __tco_done = true;
                        return acc;
                    };
                    if (v instanceof Cons) {
                        __tco_acc = new Cons(v.value0, acc);
                        __tco_v = v.value1;
                        return;
                    };
                    throw new Error("Failed pattern match at Data.List.Types line 71, column 15 - line 73, column 33: " + [ v.constructor.name ]);
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(acc, v);
                    acc = __tco_acc;
                    v = __tco_v;
                };
                return __tco_result;
            };
        };
        return function ($114) {
            return Data_Foldable.foldl(foldableList)(Data_Function.flip(f))(b)(rev(Nil.value)($114));
        };
    };
});
var foldableNonEmptyList = Data_NonEmpty.foldableNonEmpty(foldableList);
var functorList = new Data_Functor.Functor(function (f) {
    return Data_Foldable.foldr(foldableList)(function (x) {
        return function (acc) {
            return new Cons(f(x), acc);
        };
    })(Nil.value);
});
var functorNonEmptyList = Data_NonEmpty.functorNonEmpty(functorList);
var semigroupList = new Data_Semigroup.Semigroup(function (xs) {
    return function (ys) {
        return Data_Foldable.foldr(foldableList)(Cons.create)(ys)(xs);
    };
});
var monoidList = new Data_Monoid.Monoid(function () {
    return semigroupList;
}, Nil.value);
var semigroupNonEmptyList = new Data_Semigroup.Semigroup(function (v) {
    return function (as$prime) {
        return new Data_NonEmpty.NonEmpty(v.value0, Data_Semigroup.append(semigroupList)(v.value1)(toList(as$prime)));
    };
});
var showList = function (dictShow) {
    return new Data_Show.Show(function (v) {
        if (v instanceof Nil) {
            return "Nil";
        };
        return "(" + (Data_Foldable.intercalate(foldableList)(Data_Monoid.monoidString)(" : ")(Data_Functor.map(functorList)(Data_Show.show(dictShow))(v)) + " : Nil)");
    });
};
var showNonEmptyList = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(NonEmptyList " + (Data_Show.show(Data_NonEmpty.showNonEmpty(dictShow)(showList(dictShow)))(v) + ")");
    });
};
var traversableList = new Data_Traversable.Traversable(function () {
    return foldableList;
}, function () {
    return functorList;
}, function (dictApplicative) {
    return Data_Traversable.traverse(traversableList)(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
}, function (dictApplicative) {
    return function (f) {
        return function ($115) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Foldable.foldl(foldableList)(Data_Function.flip(Cons.create))(Nil.value))(Data_Foldable.foldl(foldableList)(function (acc) {
                return function ($116) {
                    return Control_Apply.lift2(dictApplicative.Apply0())(Data_Function.flip(Cons.create))(acc)(f($116));
                };
            })(Control_Applicative.pure(dictApplicative)(Nil.value))($115));
        };
    };
});
var traversableNonEmptyList = Data_NonEmpty.traversableNonEmpty(traversableList);
var unfoldableList = new Data_Unfoldable.Unfoldable(function (f) {
    return function (b) {
        var go = function (__copy_source) {
            return function (__copy_memo) {
                var source = __copy_source;
                var memo = __copy_memo;
                var __tco_done = false;
                var __tco_result;
                var __tco_source;
                var __tco_memo;
                function __tco_loop(source, memo) {
                    var v = f(source);
                    if (v instanceof Data_Maybe.Nothing) {
                        __tco_done = true;
                        return Data_Foldable.foldl(foldableList)(Data_Function.flip(Cons.create))(Nil.value)(memo);
                    };
                    if (v instanceof Data_Maybe.Just) {
                        __tco_source = v.value0.value1;
                        __tco_memo = new Cons(v.value0.value0, memo);
                        return;
                    };
                    throw new Error("Failed pattern match at Data.List.Types line 84, column 22 - line 86, column 52: " + [ v.constructor.name ]);
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(source, memo);
                    source = __tco_source;
                    memo = __tco_memo;
                };
                return __tco_result;
            };
        };
        return go(b)(Nil.value);
    };
});
var extendNonEmptyList = new Control_Extend.Extend(function () {
    return functorNonEmptyList;
}, function (f) {
    return function (v) {
        var go = function (a) {
            return function (v1) {
                return {
                    val: new Cons(f(new Data_NonEmpty.NonEmpty(a, v1.acc)), v1.val), 
                    acc: new Cons(a, v1.acc)
                };
            };
        };
        return new Data_NonEmpty.NonEmpty(f(v), (Data_Foldable.foldr(foldableList)(go)({
            val: Nil.value, 
            acc: Nil.value
        })(v.value1)).val);
    };
});
var extendList = new Control_Extend.Extend(function () {
    return functorList;
}, function (f) {
    return function (v) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            var go = function (a$prime) {
                return function (v1) {
                    var acc$prime = new Cons(a$prime, v1.acc);
                    return {
                        val: new Cons(f(acc$prime), v1.val), 
                        acc: acc$prime
                    };
                };
            };
            return new Cons(f(v), (Data_Foldable.foldr(foldableList)(go)({
                val: Nil.value, 
                acc: Nil.value
            })(v.value1)).val);
        };
        throw new Error("Failed pattern match at Data.List.Types line 118, column 3 - line 118, column 21: " + [ f.constructor.name, v.constructor.name ]);
    };
});
var eq1List = new Data_Eq.Eq1(function (dictEq) {
    return function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    return function (__copy_v2) {
                        var v = __copy_v;
                        var v1 = __copy_v1;
                        var v2 = __copy_v2;
                        var __tco_done = false;
                        var __tco_result;
                        var __tco_v;
                        var __tco_v1;
                        var __tco_v2;
                        function __tco_loop(v, v1, v2) {
                            if (!v2) {
                                __tco_done = true;
                                return false;
                            };
                            if (v instanceof Nil && v1 instanceof Nil) {
                                __tco_done = true;
                                return v2;
                            };
                            if (v instanceof Cons && v1 instanceof Cons) {
                                __tco_v = v.value1;
                                __tco_v1 = v1.value1;
                                __tco_v2 = v2 && Data_Eq.eq(dictEq)(v1.value0)(v.value0);
                                return;
                            };
                            __tco_done = true;
                            return false;
                        };
                        while (!__tco_done) {
                            __tco_result = __tco_loop(v, v1, v2);
                            v = __tco_v;
                            v1 = __tco_v1;
                            v2 = __tco_v2;
                        };
                        return __tco_result;
                    };
                };
            };
            return go(xs)(ys)(true);
        };
    };
});
var eqList = function (dictEq) {
    return new Data_Eq.Eq(Data_Eq.eq1(eq1List)(dictEq));
};
var eqNonEmptyList = function (dictEq) {
    return Data_NonEmpty.eqNonEmpty(eq1List)(dictEq);
};
var ord1List = new Data_Ord.Ord1(function () {
    return eq1List;
}, function (dictOrd) {
    return function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    var v = __copy_v;
                    var v1 = __copy_v1;
                    var __tco_done = false;
                    var __tco_result;
                    var __tco_v;
                    var __tco_v1;
                    function __tco_loop(v, v1) {
                        if (v instanceof Nil && v1 instanceof Nil) {
                            __tco_done = true;
                            return Data_Ordering.EQ.value;
                        };
                        if (v instanceof Nil) {
                            __tco_done = true;
                            return Data_Ordering.LT.value;
                        };
                        if (v1 instanceof Nil) {
                            __tco_done = true;
                            return Data_Ordering.GT.value;
                        };
                        if (v instanceof Cons && v1 instanceof Cons) {
                            var v2 = Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                            if (v2 instanceof Data_Ordering.EQ) {
                                __tco_v = v.value1;
                                __tco_v1 = v1.value1;
                                return;
                            };
                            __tco_done = true;
                            return v2;
                        };
                        throw new Error("Failed pattern match at Data.List.Types line 49, column 20 - line 57, column 23: " + [ v.constructor.name, v1.constructor.name ]);
                    };
                    while (!__tco_done) {
                        __tco_result = __tco_loop(v, v1);
                        v = __tco_v;
                        v1 = __tco_v1;
                    };
                    return __tco_result;
                };
            };
            return go(xs)(ys);
        };
    };
});
var ordList = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqList(dictOrd.Eq0());
    }, Data_Ord.compare1(ord1List)(dictOrd));
};
var ordNonEmptyList = function (dictOrd) {
    return Data_NonEmpty.ordNonEmpty(ord1List)(dictOrd);
};
var comonadNonEmptyList = new Control_Comonad.Comonad(function () {
    return extendNonEmptyList;
}, function (v) {
    return v.value0;
});
var applyList = new Control_Apply.Apply(function () {
    return functorList;
}, function (v) {
    return function (v1) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            return Data_Semigroup.append(semigroupList)(Data_Functor.map(functorList)(v.value0)(v1))(Control_Apply.apply(applyList)(v.value1)(v1));
        };
        throw new Error("Failed pattern match at Data.List.Types line 93, column 3 - line 93, column 20: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var applyNonEmptyList = new Control_Apply.Apply(function () {
    return functorNonEmptyList;
}, function (v) {
    return function (v1) {
        return new Data_NonEmpty.NonEmpty(v.value0(v1.value0), Data_Semigroup.append(semigroupList)(Control_Apply.apply(applyList)(v.value1)(new Cons(v1.value0, Nil.value)))(Control_Apply.apply(applyList)(new Cons(v.value0, v.value1))(v1.value1)));
    };
});
var bindList = new Control_Bind.Bind(function () {
    return applyList;
}, function (v) {
    return function (v1) {
        if (v instanceof Nil) {
            return Nil.value;
        };
        if (v instanceof Cons) {
            return Data_Semigroup.append(semigroupList)(v1(v.value0))(Control_Bind.bind(bindList)(v.value1)(v1));
        };
        throw new Error("Failed pattern match at Data.List.Types line 100, column 3 - line 100, column 19: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindNonEmptyList = new Control_Bind.Bind(function () {
    return applyNonEmptyList;
}, function (v) {
    return function (f) {
        var v1 = f(v.value0);
        return new Data_NonEmpty.NonEmpty(v1.value0, Data_Semigroup.append(semigroupList)(v1.value1)(Control_Bind.bind(bindList)(v.value1)(function ($117) {
            return toList(f($117));
        })));
    };
});
var applicativeList = new Control_Applicative.Applicative(function () {
    return applyList;
}, function (a) {
    return new Cons(a, Nil.value);
});
var monadList = new Control_Monad.Monad(function () {
    return applicativeList;
}, function () {
    return bindList;
});
var altNonEmptyList = new Control_Alt.Alt(function () {
    return functorNonEmptyList;
}, Data_Semigroup.append(semigroupNonEmptyList));
var altList = new Control_Alt.Alt(function () {
    return functorList;
}, Data_Semigroup.append(semigroupList));
var plusList = new Control_Plus.Plus(function () {
    return altList;
}, Nil.value);
var alternativeList = new Control_Alternative.Alternative(function () {
    return applicativeList;
}, function () {
    return plusList;
});
var monadZeroList = new Control_MonadZero.MonadZero(function () {
    return alternativeList;
}, function () {
    return monadList;
});
var monadPlusList = new Control_MonadPlus.MonadPlus(function () {
    return monadZeroList;
});
var applicativeNonEmptyList = new Control_Applicative.Applicative(function () {
    return applyNonEmptyList;
}, function ($118) {
    return NonEmptyList(Data_NonEmpty.singleton(plusList)($118));
});
var monadNonEmptyList = new Control_Monad.Monad(function () {
    return applicativeNonEmptyList;
}, function () {
    return bindNonEmptyList;
});
module.exports = {
    Nil: Nil, 
    Cons: Cons, 
    NonEmptyList: NonEmptyList, 
    toList: toList, 
    showList: showList, 
    eqList: eqList, 
    eq1List: eq1List, 
    ordList: ordList, 
    ord1List: ord1List, 
    semigroupList: semigroupList, 
    monoidList: monoidList, 
    functorList: functorList, 
    foldableList: foldableList, 
    unfoldableList: unfoldableList, 
    traversableList: traversableList, 
    applyList: applyList, 
    applicativeList: applicativeList, 
    bindList: bindList, 
    monadList: monadList, 
    altList: altList, 
    plusList: plusList, 
    alternativeList: alternativeList, 
    monadZeroList: monadZeroList, 
    monadPlusList: monadPlusList, 
    extendList: extendList, 
    newtypeNonEmptyList: newtypeNonEmptyList, 
    eqNonEmptyList: eqNonEmptyList, 
    ordNonEmptyList: ordNonEmptyList, 
    showNonEmptyList: showNonEmptyList, 
    functorNonEmptyList: functorNonEmptyList, 
    applyNonEmptyList: applyNonEmptyList, 
    applicativeNonEmptyList: applicativeNonEmptyList, 
    bindNonEmptyList: bindNonEmptyList, 
    monadNonEmptyList: monadNonEmptyList, 
    altNonEmptyList: altNonEmptyList, 
    extendNonEmptyList: extendNonEmptyList, 
    comonadNonEmptyList: comonadNonEmptyList, 
    semigroupNonEmptyList: semigroupNonEmptyList, 
    foldableNonEmptyList: foldableNonEmptyList, 
    traversableNonEmptyList: traversableNonEmptyList
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":66,"../Control.Semigroupoid":67,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.NonEmpty":132,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Show":145,"../Data.Traversable":152,"../Data.Tuple":153,"../Data.Unfoldable":155,"../Prelude":168}],119:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Boolean = require("../Data.Boolean");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_List_Types = require("../Data.List.Types");
var Data_Maybe = require("../Data.Maybe");
var Data_NonEmpty = require("../Data.NonEmpty");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unfoldable = require("../Data.Unfoldable");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var updateAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0 && v2 instanceof Data_List_Types.Cons) {
                return new Data_Maybe.Just(new Data_List_Types.Cons(v1, v2.value1));
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(updateAt(v - 1 | 0)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var unzip = Data_Foldable.foldr(Data_List_Types.foldableList)(function (v) {
    return function (v1) {
        return new Data_Tuple.Tuple(new Data_List_Types.Cons(v.value0, v1.value0), new Data_List_Types.Cons(v.value1, v1.value1));
    };
})(new Data_Tuple.Tuple(Data_List_Types.Nil.value, Data_List_Types.Nil.value));
var uncons = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just({
            head: v.value0, 
            tail: v.value1
        });
    };
    throw new Error("Failed pattern match at Data.List line 253, column 1 - line 253, column 21: " + [ v.constructor.name ]);
};
var toUnfoldable = function (dictUnfoldable) {
    return Data_Unfoldable.unfoldr(dictUnfoldable)(function (xs) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(function (rec) {
            return new Data_Tuple.Tuple(rec.head, rec.tail);
        })(uncons(xs));
    });
};
var tail = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just(v.value1);
    };
    throw new Error("Failed pattern match at Data.List line 239, column 1 - line 239, column 19: " + [ v.constructor.name ]);
};
var span = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Cons && v(v1.value0)) {
            var v2 = span(v)(v1.value1);
            return {
                init: new Data_List_Types.Cons(v1.value0, v2.init), 
                rest: v2.rest
            };
        };
        return {
            init: Data_List_Types.Nil.value, 
            rest: v1
        };
    };
};
var singleton = function (a) {
    return new Data_List_Types.Cons(a, Data_List_Types.Nil.value);
};
var sortBy = function (cmp) {
    var merge = function (v) {
        return function (v1) {
            if (v instanceof Data_List_Types.Cons && v1 instanceof Data_List_Types.Cons) {
                if (Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1.value0))(Data_Ordering.GT.value)) {
                    return new Data_List_Types.Cons(v1.value0, merge(v)(v1.value1));
                };
                if (Data_Boolean.otherwise) {
                    return new Data_List_Types.Cons(v.value0, merge(v.value1)(v1));
                };
            };
            if (v instanceof Data_List_Types.Nil) {
                return v1;
            };
            if (v1 instanceof Data_List_Types.Nil) {
                return v;
            };
            throw new Error("Failed pattern match at Data.List line 468, column 3 - line 470, column 41: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
    var mergePairs = function (v) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Cons) {
            return new Data_List_Types.Cons(merge(v.value0)(v.value1.value0), mergePairs(v.value1.value1));
        };
        return v;
    };
    var mergeAll = function (__copy_v) {
        var v = __copy_v;
        var __tco_done = false;
        var __tco_result;
        var __tco_v;
        function __tco_loop(v) {
            if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Nil) {
                __tco_done = true;
                return v.value0;
            };
            __tco_v = mergePairs(v);
            return;
        };
        while (!__tco_done) {
            __tco_result = __tco_loop(v);
            v = __tco_v;
        };
        return __tco_result;
    };
    var sequences = function (v) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Cons) {
            if (Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v.value1.value0))(Data_Ordering.GT.value)) {
                return descending(v.value1.value0)(singleton(v.value0))(v.value1.value1);
            };
            if (Data_Boolean.otherwise) {
                return ascending(v.value1.value0)(function (v1) {
                    return new Data_List_Types.Cons(v.value0, v1);
                })(v.value1.value1);
            };
        };
        return singleton(v);
    };
    var descending = function (__copy_a) {
        return function (__copy_as) {
            return function (__copy_v) {
                var a = __copy_a;
                var as = __copy_as;
                var v = __copy_v;
                var __tco_done = false;
                var __tco_result;
                var __tco_a;
                var __tco_as;
                var __tco_v;
                function __tco_loop(a, as, v) {
                    if (v instanceof Data_List_Types.Cons && Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(a)(v.value0))(Data_Ordering.GT.value)) {
                        __tco_a = v.value0;
                        __tco_as = new Data_List_Types.Cons(a, as);
                        __tco_v = v.value1;
                        return;
                    };
                    __tco_done = true;
                    return new Data_List_Types.Cons(new Data_List_Types.Cons(a, as), sequences(v));
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(a, as, v);
                    a = __tco_a;
                    as = __tco_as;
                    v = __tco_v;
                };
                return __tco_result;
            };
        };
    };
    var ascending = function (__copy_a) {
        return function (__copy_as) {
            return function (__copy_v) {
                var a = __copy_a;
                var as = __copy_as;
                var v = __copy_v;
                var __tco_done = false;
                var __tco_result;
                var __tco_a;
                var __tco_as;
                var __tco_v;
                function __tco_loop(a, as, v) {
                    if (v instanceof Data_List_Types.Cons && Data_Eq.notEq(Data_Ordering.eqOrdering)(cmp(a)(v.value0))(Data_Ordering.GT.value)) {
                        __tco_a = v.value0;
                        __tco_as = function (ys) {
                            return as(new Data_List_Types.Cons(a, ys));
                        };
                        __tco_v = v.value1;
                        return;
                    };
                    __tco_done = true;
                    return new Data_List_Types.Cons(as(singleton(a)), sequences(v));
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(a, as, v);
                    a = __tco_a;
                    as = __tco_as;
                    v = __tco_v;
                };
                return __tco_result;
            };
        };
    };
    return function ($307) {
        return mergeAll(sequences($307));
    };
};
var sort = function (dictOrd) {
    return function (xs) {
        return sortBy(Data_Ord.compare(dictOrd))(xs);
    };
};
var reverse = (function () {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            var __tco_done = false;
            var __tco_result;
            var __tco_acc;
            var __tco_v;
            function __tco_loop(acc, v) {
                if (v instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return acc;
                };
                if (v instanceof Data_List_Types.Cons) {
                    __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                    __tco_v = v.value1;
                    return;
                };
                throw new Error("Failed pattern match at Data.List line 359, column 11 - line 362, column 36: " + [ acc.constructor.name, v.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(acc, v);
                acc = __tco_acc;
                v = __tco_v;
            };
            return __tco_result;
        };
    };
    return go(Data_List_Types.Nil.value);
})();
var snoc = function (xs) {
    return function (x) {
        return reverse(new Data_List_Types.Cons(x, reverse(xs)));
    };
};
var take = (function () {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            return function (__copy_v1) {
                var acc = __copy_acc;
                var v = __copy_v;
                var v1 = __copy_v1;
                var __tco_done = false;
                var __tco_result;
                var __tco_acc;
                var __tco_v;
                var __tco_v1;
                function __tco_loop(acc, v, v1) {
                    if (v === 0) {
                        __tco_done = true;
                        return reverse(acc);
                    };
                    if (v1 instanceof Data_List_Types.Nil) {
                        __tco_done = true;
                        return reverse(acc);
                    };
                    if (v1 instanceof Data_List_Types.Cons) {
                        __tco_acc = new Data_List_Types.Cons(v1.value0, acc);
                        __tco_v = v - 1 | 0;
                        __tco_v1 = v1.value1;
                        return;
                    };
                    throw new Error("Failed pattern match at Data.List line 486, column 8 - line 490, column 46: " + [ acc.constructor.name, v.constructor.name, v1.constructor.name ]);
                };
                while (!__tco_done) {
                    __tco_result = __tco_loop(acc, v, v1);
                    acc = __tco_acc;
                    v = __tco_v;
                    v1 = __tco_v1;
                };
                return __tco_result;
            };
        };
    };
    return go(Data_List_Types.Nil.value);
})();
var takeWhile = function (p) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            var __tco_done = false;
            var __tco_result;
            var __tco_acc;
            var __tco_v;
            function __tco_loop(acc, v) {
                if (v instanceof Data_List_Types.Cons && p(v.value0)) {
                    __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                    __tco_v = v.value1;
                    return;
                };
                __tco_done = true;
                return reverse(acc);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(acc, v);
                acc = __tco_acc;
                v = __tco_v;
            };
            return __tco_result;
        };
    };
    return go(Data_List_Types.Nil.value);
};
var unsnoc = function (lst) {
    var go = function (__copy_v) {
        return function (__copy_acc) {
            var v = __copy_v;
            var acc = __copy_acc;
            var __tco_done = false;
            var __tco_result;
            var __tco_v;
            var __tco_acc;
            function __tco_loop(v, acc) {
                if (v instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return Data_Maybe.Nothing.value;
                };
                if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return new Data_Maybe.Just({
                        revInit: acc, 
                        last: v.value0
                    });
                };
                if (v instanceof Data_List_Types.Cons) {
                    __tco_v = v.value1;
                    __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                    return;
                };
                throw new Error("Failed pattern match at Data.List line 261, column 14 - line 265, column 36: " + [ v.constructor.name, acc.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(v, acc);
                v = __tco_v;
                acc = __tco_acc;
            };
            return __tco_result;
        };
    };
    return Data_Functor.map(Data_Maybe.functorMaybe)(function (h) {
        return {
            init: reverse(h.revInit), 
            last: h.last
        };
    })(go(lst)(Data_List_Types.Nil.value));
};
var zipWith = function (f) {
    return function (xs) {
        return function (ys) {
            var go = function (__copy_v) {
                return function (__copy_v1) {
                    return function (__copy_acc) {
                        var v = __copy_v;
                        var v1 = __copy_v1;
                        var acc = __copy_acc;
                        var __tco_done = false;
                        var __tco_result;
                        var __tco_v;
                        var __tco_v1;
                        var __tco_acc;
                        function __tco_loop(v, v1, acc) {
                            if (v instanceof Data_List_Types.Nil) {
                                __tco_done = true;
                                return acc;
                            };
                            if (v1 instanceof Data_List_Types.Nil) {
                                __tco_done = true;
                                return acc;
                            };
                            if (v instanceof Data_List_Types.Cons && v1 instanceof Data_List_Types.Cons) {
                                __tco_v = v.value1;
                                __tco_v1 = v1.value1;
                                __tco_acc = new Data_List_Types.Cons(f(v.value0)(v1.value0), acc);
                                return;
                            };
                            throw new Error("Failed pattern match at Data.List line 650, column 19 - line 654, column 52: " + [ v.constructor.name, v1.constructor.name, acc.constructor.name ]);
                        };
                        while (!__tco_done) {
                            __tco_result = __tco_loop(v, v1, acc);
                            v = __tco_v;
                            v1 = __tco_v1;
                            acc = __tco_acc;
                        };
                        return __tco_result;
                    };
                };
            };
            return reverse(go(xs)(ys)(Data_List_Types.Nil.value));
        };
    };
};
var zip = zipWith(Data_Tuple.Tuple.create);
var zipWithA = function (dictApplicative) {
    return function (f) {
        return function (xs) {
            return function (ys) {
                return Data_Traversable.sequence(Data_List_Types.traversableList)(dictApplicative)(zipWith(f)(xs)(ys));
            };
        };
    };
};
var range = function (start) {
    return function (end) {
        if (start === end) {
            return singleton(start);
        };
        if (Data_Boolean.otherwise) {
            var go = function (__copy_s) {
                return function (__copy_e) {
                    return function (__copy_step) {
                        return function (__copy_rest) {
                            var s = __copy_s;
                            var e = __copy_e;
                            var step = __copy_step;
                            var rest = __copy_rest;
                            var __tco_done = false;
                            var __tco_result;
                            var __tco_s;
                            var __tco_e;
                            var __tco_step;
                            var __tco_rest;
                            function __tco_loop(s, e, step, rest) {
                                if (s === e) {
                                    __tco_done = true;
                                    return new Data_List_Types.Cons(s, rest);
                                };
                                if (Data_Boolean.otherwise) {
                                    __tco_s = s + step | 0;
                                    __tco_e = e;
                                    __tco_step = step;
                                    __tco_rest = new Data_List_Types.Cons(s, rest);
                                    return;
                                };
                                throw new Error("Failed pattern match at Data.List line 139, column 31 - line 142, column 65: " + [ s.constructor.name, e.constructor.name, step.constructor.name, rest.constructor.name ]);
                            };
                            while (!__tco_done) {
                                __tco_result = __tco_loop(s, e, step, rest);
                                s = __tco_s;
                                e = __tco_e;
                                step = __tco_step;
                                rest = __tco_rest;
                            };
                            return __tco_result;
                        };
                    };
                };
            };
            return go(end)(start)((function () {
                var $195 = start > end;
                if ($195) {
                    return 1;
                };
                return -1 | 0;
            })())(Data_List_Types.Nil.value);
        };
        throw new Error("Failed pattern match at Data.List line 138, column 1 - line 142, column 65: " + [ start.constructor.name, end.constructor.name ]);
    };
};
var $$null = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return true;
    };
    return false;
};
var mapWithIndex = function (f) {
    return function (lst) {
        var go = function (__copy_v) {
            return function (__copy_v1) {
                return function (__copy_acc) {
                    var v = __copy_v;
                    var v1 = __copy_v1;
                    var acc = __copy_acc;
                    var __tco_done = false;
                    var __tco_result;
                    var __tco_v;
                    var __tco_v1;
                    var __tco_acc;
                    function __tco_loop(v, v1, acc) {
                        if (v1 instanceof Data_List_Types.Nil) {
                            __tco_done = true;
                            return acc;
                        };
                        if (v1 instanceof Data_List_Types.Cons) {
                            __tco_v = v + 1 | 0;
                            __tco_v1 = v1.value1;
                            __tco_acc = new Data_List_Types.Cons(f(v)(v1.value0), acc);
                            return;
                        };
                        throw new Error("Failed pattern match at Data.List line 424, column 22 - line 427, column 48: " + [ v.constructor.name, v1.constructor.name, acc.constructor.name ]);
                    };
                    while (!__tco_done) {
                        __tco_result = __tco_loop(v, v1, acc);
                        v = __tco_v;
                        v1 = __tco_v1;
                        acc = __tco_acc;
                    };
                    return __tco_result;
                };
            };
        };
        return reverse(go(0)(lst)(Data_List_Types.Nil.value));
    };
};
var mapMaybe = function (f) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            var __tco_done = false;
            var __tco_result;
            var __tco_acc;
            var __tco_v;
            function __tco_loop(acc, v) {
                if (v instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return reverse(acc);
                };
                if (v instanceof Data_List_Types.Cons) {
                    var v1 = f(v.value0);
                    if (v1 instanceof Data_Maybe.Nothing) {
                        __tco_acc = acc;
                        __tco_v = v.value1;
                        return;
                    };
                    if (v1 instanceof Data_Maybe.Just) {
                        __tco_acc = new Data_List_Types.Cons(v1.value0, acc);
                        __tco_v = v.value1;
                        return;
                    };
                    throw new Error("Failed pattern match at Data.List line 412, column 5 - line 414, column 32: " + [ v1.constructor.name ]);
                };
                throw new Error("Failed pattern match at Data.List line 408, column 14 - line 414, column 32: " + [ acc.constructor.name, v.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(acc, v);
                acc = __tco_acc;
                v = __tco_v;
            };
            return __tco_result;
        };
    };
    return go(Data_List_Types.Nil.value);
};
var manyRec = function (dictMonadRec) {
    return function (dictAlternative) {
        return function (p) {
            var go = function (acc) {
                return Control_Bind.bind((dictMonadRec.Monad0()).Bind1())(Control_Alt.alt((dictAlternative.Plus1()).Alt0())(Data_Functor.map(((dictAlternative.Plus1()).Alt0()).Functor0())(Control_Monad_Rec_Class.Loop.create)(p))(Control_Applicative.pure(dictAlternative.Applicative0())(new Control_Monad_Rec_Class.Done(Data_Unit.unit))))(function (v) {
                    return Control_Applicative.pure(dictAlternative.Applicative0())(Data_Bifunctor.bimap(Control_Monad_Rec_Class.bifunctorStep)(function (v1) {
                        return new Data_List_Types.Cons(v1, acc);
                    })(function (v1) {
                        return reverse(acc);
                    })(v));
                });
            };
            return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(go)(Data_List_Types.Nil.value);
        };
    };
};
var someRec = function (dictMonadRec) {
    return function (dictAlternative) {
        return function (v) {
            return Control_Apply.apply((dictAlternative.Applicative0()).Apply0())(Data_Functor.map(((dictAlternative.Plus1()).Alt0()).Functor0())(Data_List_Types.Cons.create)(v))(manyRec(dictMonadRec)(dictAlternative)(v));
        };
    };
};
var some = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Apply.apply((dictAlternative.Applicative0()).Apply0())(Data_Functor.map(((dictAlternative.Plus1()).Alt0()).Functor0())(Data_List_Types.Cons.create)(v))(Control_Lazy.defer(dictLazy)(function (v1) {
                return many(dictAlternative)(dictLazy)(v);
            }));
        };
    };
};
var many = function (dictAlternative) {
    return function (dictLazy) {
        return function (v) {
            return Control_Alt.alt((dictAlternative.Plus1()).Alt0())(some(dictAlternative)(dictLazy)(v))(Control_Applicative.pure(dictAlternative.Applicative0())(Data_List_Types.Nil.value));
        };
    };
};
var length = Data_Foldable.foldl(Data_List_Types.foldableList)(function (acc) {
    return function (v) {
        return acc + 1 | 0;
    };
})(0);
var last = function (__copy_v) {
    var v = __copy_v;
    var __tco_done = false;
    var __tco_result;
    var __tco_v;
    function __tco_loop(v) {
        if (v instanceof Data_List_Types.Cons && v.value1 instanceof Data_List_Types.Nil) {
            __tco_done = true;
            return new Data_Maybe.Just(v.value0);
        };
        if (v instanceof Data_List_Types.Cons) {
            __tco_v = v.value1;
            return;
        };
        __tco_done = true;
        return Data_Maybe.Nothing.value;
    };
    while (!__tco_done) {
        __tco_result = __tco_loop(v);
        v = __tco_v;
    };
    return __tco_result;
};
var insertBy = function (v) {
    return function (x) {
        return function (v1) {
            if (v1 instanceof Data_List_Types.Nil) {
                return singleton(x);
            };
            if (v1 instanceof Data_List_Types.Cons) {
                var v2 = v(x)(v1.value0);
                if (v2 instanceof Data_Ordering.GT) {
                    return new Data_List_Types.Cons(v1.value0, insertBy(v)(x)(v1.value1));
                };
                return new Data_List_Types.Cons(x, v1);
            };
            throw new Error("Failed pattern match at Data.List line 210, column 1 - line 210, column 31: " + [ v.constructor.name, x.constructor.name, v1.constructor.name ]);
        };
    };
};
var insertAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0) {
                return new Data_Maybe.Just(new Data_List_Types.Cons(v1, v2));
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(insertAt(v - 1 | 0)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var insert = function (dictOrd) {
    return insertBy(Data_Ord.compare(dictOrd));
};
var init = function (lst) {
    return Data_Functor.map(Data_Maybe.functorMaybe)(function (v) {
        return v.init;
    })(unsnoc(lst));
};
var index = function (__copy_v) {
    return function (__copy_v1) {
        var v = __copy_v;
        var v1 = __copy_v1;
        var __tco_done = false;
        var __tco_result;
        var __tco_v;
        var __tco_v1;
        function __tco_loop(v, v1) {
            if (v instanceof Data_List_Types.Nil) {
                __tco_done = true;
                return Data_Maybe.Nothing.value;
            };
            if (v instanceof Data_List_Types.Cons && v1 === 0) {
                __tco_done = true;
                return new Data_Maybe.Just(v.value0);
            };
            if (v instanceof Data_List_Types.Cons) {
                __tco_v = v.value1;
                __tco_v1 = v1 - 1 | 0;
                return;
            };
            throw new Error("Failed pattern match at Data.List line 275, column 1 - line 275, column 22: " + [ v.constructor.name, v1.constructor.name ]);
        };
        while (!__tco_done) {
            __tco_result = __tco_loop(v, v1);
            v = __tco_v;
            v1 = __tco_v1;
        };
        return __tco_result;
    };
};
var head = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_Maybe.Nothing.value;
    };
    if (v instanceof Data_List_Types.Cons) {
        return new Data_Maybe.Just(v.value0);
    };
    throw new Error("Failed pattern match at Data.List line 224, column 1 - line 224, column 19: " + [ v.constructor.name ]);
};
var transpose = function (v) {
    if (v instanceof Data_List_Types.Nil) {
        return Data_List_Types.Nil.value;
    };
    if (v instanceof Data_List_Types.Cons && v.value0 instanceof Data_List_Types.Nil) {
        return transpose(v.value1);
    };
    if (v instanceof Data_List_Types.Cons && v.value0 instanceof Data_List_Types.Cons) {
        return new Data_List_Types.Cons(new Data_List_Types.Cons(v.value0.value0, mapMaybe(head)(v.value1)), transpose(new Data_List_Types.Cons(v.value0.value1, mapMaybe(tail)(v.value1))));
    };
    throw new Error("Failed pattern match at Data.List line 687, column 1 - line 687, column 20: " + [ v.constructor.name ]);
};
var groupBy = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Nil) {
            return Data_List_Types.Nil.value;
        };
        if (v1 instanceof Data_List_Types.Cons) {
            var v2 = span(v(v1.value0))(v1.value1);
            return new Data_List_Types.Cons(new Data_NonEmpty.NonEmpty(v1.value0, v2.init), groupBy(v)(v2.rest));
        };
        throw new Error("Failed pattern match at Data.List line 560, column 1 - line 560, column 20: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var group = function (dictEq) {
    return groupBy(Data_Eq.eq(dictEq));
};
var group$prime = function (dictOrd) {
    return function ($308) {
        return group(dictOrd.Eq0())(sort(dictOrd)($308));
    };
};
var fromFoldable = function (dictFoldable) {
    return Data_Foldable.foldr(dictFoldable)(Data_List_Types.Cons.create)(Data_List_Types.Nil.value);
};
var foldM = function (dictMonad) {
    return function (v) {
        return function (a) {
            return function (v1) {
                if (v1 instanceof Data_List_Types.Nil) {
                    return Control_Applicative.pure(dictMonad.Applicative0())(a);
                };
                if (v1 instanceof Data_List_Types.Cons) {
                    return Control_Bind.bind(dictMonad.Bind1())(v(a)(v1.value0))(function (a$prime) {
                        return foldM(dictMonad)(v)(a$prime)(v1.value1);
                    });
                };
                throw new Error("Failed pattern match at Data.List line 698, column 1 - line 698, column 23: " + [ v.constructor.name, a.constructor.name, v1.constructor.name ]);
            };
        };
    };
};
var findIndex = function (fn) {
    var go = function (__copy_v) {
        return function (__copy_v1) {
            var v = __copy_v;
            var v1 = __copy_v1;
            var __tco_done = false;
            var __tco_result;
            var __tco_v;
            var __tco_v1;
            function __tco_loop(v, v1) {
                if (v1 instanceof Data_List_Types.Cons) {
                    if (fn(v1.value0)) {
                        __tco_done = true;
                        return new Data_Maybe.Just(v);
                    };
                    if (Data_Boolean.otherwise) {
                        __tco_v = v + 1 | 0;
                        __tco_v1 = v1.value1;
                        return;
                    };
                };
                if (v1 instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return Data_Maybe.Nothing.value;
                };
                throw new Error("Failed pattern match at Data.List line 295, column 3 - line 296, column 44: " + [ v.constructor.name, v1.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(v, v1);
                v = __tco_v;
                v1 = __tco_v1;
            };
            return __tco_result;
        };
    };
    return go(0);
};
var findLastIndex = function (fn) {
    return function (xs) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(function (v) {
            return (length(xs) - 1 | 0) - v | 0;
        })(findIndex(fn)(reverse(xs)));
    };
};
var filterM = function (dictMonad) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Data_List_Types.Nil) {
                return Control_Applicative.pure(dictMonad.Applicative0())(Data_List_Types.Nil.value);
            };
            if (v1 instanceof Data_List_Types.Cons) {
                return Control_Bind.bind(dictMonad.Bind1())(v(v1.value0))(function (v2) {
                    return Control_Bind.bind(dictMonad.Bind1())(filterM(dictMonad)(v)(v1.value1))(function (v3) {
                        return Control_Applicative.pure(dictMonad.Applicative0())((function () {
                            if (v2) {
                                return new Data_List_Types.Cons(v1.value0, v3);
                            };
                            return v3;
                        })());
                    });
                });
            };
            throw new Error("Failed pattern match at Data.List line 397, column 1 - line 397, column 25: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var filter = function (p) {
    var go = function (__copy_acc) {
        return function (__copy_v) {
            var acc = __copy_acc;
            var v = __copy_v;
            var __tco_done = false;
            var __tco_result;
            var __tco_acc;
            var __tco_v;
            function __tco_loop(acc, v) {
                if (v instanceof Data_List_Types.Nil) {
                    __tco_done = true;
                    return reverse(acc);
                };
                if (v instanceof Data_List_Types.Cons) {
                    if (p(v.value0)) {
                        __tco_acc = new Data_List_Types.Cons(v.value0, acc);
                        __tco_v = v.value1;
                        return;
                    };
                    if (Data_Boolean.otherwise) {
                        __tco_acc = acc;
                        __tco_v = v.value1;
                        return;
                    };
                };
                throw new Error("Failed pattern match at Data.List line 381, column 12 - line 386, column 28: " + [ acc.constructor.name, v.constructor.name ]);
            };
            while (!__tco_done) {
                __tco_result = __tco_loop(acc, v);
                acc = __tco_acc;
                v = __tco_v;
            };
            return __tco_result;
        };
    };
    return go(Data_List_Types.Nil.value);
};
var intersectBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v1 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            if (v2 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            return filter(function (x) {
                return Data_Foldable.any(Data_List_Types.foldableList)(Data_HeytingAlgebra.heytingAlgebraBoolean)(v(x))(v2);
            })(v1);
        };
    };
};
var intersect = function (dictEq) {
    return intersectBy(Data_Eq.eq(dictEq));
};
var nubBy = function (v) {
    return function (v1) {
        if (v1 instanceof Data_List_Types.Nil) {
            return Data_List_Types.Nil.value;
        };
        if (v1 instanceof Data_List_Types.Cons) {
            return new Data_List_Types.Cons(v1.value0, nubBy(v)(filter(function (y) {
                return !v(v1.value0)(y);
            })(v1.value1)));
        };
        throw new Error("Failed pattern match at Data.List line 579, column 1 - line 579, column 22: " + [ v.constructor.name, v1.constructor.name ]);
    };
};
var nub = function (dictEq) {
    return nubBy(Data_Eq.eq(dictEq));
};
var elemLastIndex = function (dictEq) {
    return function (x) {
        return findLastIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var elemIndex = function (dictEq) {
    return function (x) {
        return findIndex(function (v) {
            return Data_Eq.eq(dictEq)(v)(x);
        });
    };
};
var dropWhile = function (p) {
    var go = function (__copy_v) {
        var v = __copy_v;
        var __tco_done = false;
        var __tco_result;
        var __tco_v;
        function __tco_loop(v) {
            if (v instanceof Data_List_Types.Cons && p(v.value0)) {
                __tco_v = v.value1;
                return;
            };
            __tco_done = true;
            return v;
        };
        while (!__tco_done) {
            __tco_result = __tco_loop(v);
            v = __tco_v;
        };
        return __tco_result;
    };
    return go;
};
var drop = function (__copy_v) {
    return function (__copy_v1) {
        var v = __copy_v;
        var v1 = __copy_v1;
        var __tco_done = false;
        var __tco_result;
        var __tco_v;
        var __tco_v1;
        function __tco_loop(v, v1) {
            if (v === 0) {
                __tco_done = true;
                return v1;
            };
            if (v1 instanceof Data_List_Types.Nil) {
                __tco_done = true;
                return Data_List_Types.Nil.value;
            };
            if (v1 instanceof Data_List_Types.Cons) {
                __tco_v = v - 1 | 0;
                __tco_v1 = v1.value1;
                return;
            };
            throw new Error("Failed pattern match at Data.List line 505, column 1 - line 505, column 15: " + [ v.constructor.name, v1.constructor.name ]);
        };
        while (!__tco_done) {
            __tco_result = __tco_loop(v, v1);
            v = __tco_v;
            v1 = __tco_v1;
        };
        return __tco_result;
    };
};
var slice = function (start) {
    return function (end) {
        return function (xs) {
            return take(end - start | 0)(drop(start)(xs));
        };
    };
};
var deleteBy = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Data_List_Types.Nil) {
                return Data_List_Types.Nil.value;
            };
            if (v2 instanceof Data_List_Types.Cons && v(v1)(v2.value0)) {
                return v2.value1;
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return new Data_List_Types.Cons(v2.value0, deleteBy(v)(v1)(v2.value1));
            };
            throw new Error("Failed pattern match at Data.List line 606, column 1 - line 606, column 23: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var unionBy = function (eq) {
    return function (xs) {
        return function (ys) {
            return Data_Semigroup.append(Data_List_Types.semigroupList)(xs)(Data_Foldable.foldl(Data_List_Types.foldableList)(Data_Function.flip(deleteBy(eq)))(nubBy(eq)(ys))(xs));
        };
    };
};
var union = function (dictEq) {
    return unionBy(Data_Eq.eq(dictEq));
};
var deleteAt = function (v) {
    return function (v1) {
        if (v === 0 && v1 instanceof Data_List_Types.Cons) {
            return new Data_Maybe.Just(v1.value1);
        };
        if (v1 instanceof Data_List_Types.Cons) {
            return Data_Functor.map(Data_Maybe.functorMaybe)(function (v2) {
                return new Data_List_Types.Cons(v1.value0, v2);
            })(deleteAt(v - 1 | 0)(v1.value1));
        };
        return Data_Maybe.Nothing.value;
    };
};
var $$delete = function (dictEq) {
    return deleteBy(Data_Eq.eq(dictEq));
};
var difference = function (dictEq) {
    return Data_Foldable.foldl(Data_List_Types.foldableList)(Data_Function.flip($$delete(dictEq)));
};
var concatMap = Data_Function.flip(Control_Bind.bind(Data_List_Types.bindList));
var concat = function (v) {
    return Control_Bind.bind(Data_List_Types.bindList)(v)(Control_Category.id(Control_Category.categoryFn));
};
var catMaybes = mapMaybe(Control_Category.id(Control_Category.categoryFn));
var alterAt = function (v) {
    return function (v1) {
        return function (v2) {
            if (v === 0 && v2 instanceof Data_List_Types.Cons) {
                return Data_Maybe.Just.create((function () {
                    var v3 = v1(v2.value0);
                    if (v3 instanceof Data_Maybe.Nothing) {
                        return v2.value1;
                    };
                    if (v3 instanceof Data_Maybe.Just) {
                        return new Data_List_Types.Cons(v3.value0, v2.value1);
                    };
                    throw new Error("Failed pattern match at Data.List line 345, column 3 - line 347, column 23: " + [ v3.constructor.name ]);
                })());
            };
            if (v2 instanceof Data_List_Types.Cons) {
                return Data_Functor.map(Data_Maybe.functorMaybe)(function (v3) {
                    return new Data_List_Types.Cons(v2.value0, v3);
                })(alterAt(v - 1 | 0)(v1)(v2.value1));
            };
            return Data_Maybe.Nothing.value;
        };
    };
};
var modifyAt = function (n) {
    return function (f) {
        return alterAt(n)(function ($309) {
            return Data_Maybe.Just.create(f($309));
        });
    };
};
module.exports = {
    alterAt: alterAt, 
    catMaybes: catMaybes, 
    concat: concat, 
    concatMap: concatMap, 
    "delete": $$delete, 
    deleteAt: deleteAt, 
    deleteBy: deleteBy, 
    difference: difference, 
    drop: drop, 
    dropWhile: dropWhile, 
    elemIndex: elemIndex, 
    elemLastIndex: elemLastIndex, 
    filter: filter, 
    filterM: filterM, 
    findIndex: findIndex, 
    findLastIndex: findLastIndex, 
    foldM: foldM, 
    fromFoldable: fromFoldable, 
    group: group, 
    "group'": group$prime, 
    groupBy: groupBy, 
    head: head, 
    index: index, 
    init: init, 
    insert: insert, 
    insertAt: insertAt, 
    insertBy: insertBy, 
    intersect: intersect, 
    intersectBy: intersectBy, 
    last: last, 
    length: length, 
    many: many, 
    manyRec: manyRec, 
    mapMaybe: mapMaybe, 
    mapWithIndex: mapWithIndex, 
    modifyAt: modifyAt, 
    nub: nub, 
    nubBy: nubBy, 
    "null": $$null, 
    range: range, 
    reverse: reverse, 
    singleton: singleton, 
    slice: slice, 
    snoc: snoc, 
    some: some, 
    someRec: someRec, 
    sort: sort, 
    sortBy: sortBy, 
    span: span, 
    tail: tail, 
    take: take, 
    takeWhile: takeWhile, 
    toUnfoldable: toUnfoldable, 
    transpose: transpose, 
    uncons: uncons, 
    union: union, 
    unionBy: unionBy, 
    unsnoc: unsnoc, 
    unzip: unzip, 
    updateAt: updateAt, 
    zip: zip, 
    zipWith: zipWith, 
    zipWithA: zipWithA
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Lazy":26,"../Control.Monad.Rec.Class":54,"../Control.Semigroupoid":67,"../Data.Bifunctor":82,"../Data.Boolean":84,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.List.Types":118,"../Data.Maybe":122,"../Data.NonEmpty":132,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Traversable":152,"../Data.Tuple":153,"../Data.Unfoldable":155,"../Data.Unit":157,"../Prelude":168}],120:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var First = function (x) {
    return x;
};
var showFirst = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "First (" + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupFirst = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Just) {
            return v;
        };
        return v1;
    };
});
var ordFirst = function (dictOrd) {
    return Data_Maybe.ordMaybe(dictOrd);
};
var ord1First = Data_Maybe.ord1Maybe;
var newtypeFirst = new Data_Newtype.Newtype(function (n) {
    return n;
}, First);
var monoidFirst = new Data_Monoid.Monoid(function () {
    return semigroupFirst;
}, Data_Maybe.Nothing.value);
var monadFirst = Data_Maybe.monadMaybe;
var invariantFirst = Data_Maybe.invariantMaybe;
var functorFirst = Data_Maybe.functorMaybe;
var extendFirst = Data_Maybe.extendMaybe;
var eqFirst = function (dictEq) {
    return Data_Maybe.eqMaybe(dictEq);
};
var eq1First = Data_Maybe.eq1Maybe;
var boundedFirst = function (dictBounded) {
    return Data_Maybe.boundedMaybe(dictBounded);
};
var bindFirst = Data_Maybe.bindMaybe;
var applyFirst = Data_Maybe.applyMaybe;
var applicativeFirst = Data_Maybe.applicativeMaybe;
module.exports = {
    First: First, 
    newtypeFirst: newtypeFirst, 
    eqFirst: eqFirst, 
    eq1First: eq1First, 
    ordFirst: ordFirst, 
    ord1First: ord1First, 
    boundedFirst: boundedFirst, 
    functorFirst: functorFirst, 
    invariantFirst: invariantFirst, 
    applyFirst: applyFirst, 
    applicativeFirst: applicativeFirst, 
    bindFirst: bindFirst, 
    monadFirst: monadFirst, 
    extendFirst: extendFirst, 
    showFirst: showFirst, 
    semigroupFirst: semigroupFirst, 
    monoidFirst: monoidFirst
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],121:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Last = function (x) {
    return x;
};
var showLast = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Last " + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupLast = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v1 instanceof Data_Maybe.Just) {
            return v1;
        };
        if (v1 instanceof Data_Maybe.Nothing) {
            return v;
        };
        throw new Error("Failed pattern match at Data.Maybe.Last line 54, column 3 - line 54, column 39: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var ordLast = function (dictOrd) {
    return Data_Maybe.ordMaybe(dictOrd);
};
var ord1Last = Data_Maybe.ord1Maybe;
var newtypeLast = new Data_Newtype.Newtype(function (n) {
    return n;
}, Last);
var monoidLast = new Data_Monoid.Monoid(function () {
    return semigroupLast;
}, Data_Maybe.Nothing.value);
var monadLast = Data_Maybe.monadMaybe;
var invariantLast = Data_Maybe.invariantMaybe;
var functorLast = Data_Maybe.functorMaybe;
var extendLast = Data_Maybe.extendMaybe;
var eqLast = function (dictEq) {
    return Data_Maybe.eqMaybe(dictEq);
};
var eq1Last = Data_Maybe.eq1Maybe;
var boundedLast = function (dictBounded) {
    return Data_Maybe.boundedMaybe(dictBounded);
};
var bindLast = Data_Maybe.bindMaybe;
var applyLast = Data_Maybe.applyMaybe;
var applicativeLast = Data_Maybe.applicativeMaybe;
module.exports = {
    Last: Last, 
    newtypeLast: newtypeLast, 
    eqLast: eqLast, 
    eq1Last: eq1Last, 
    ordLast: ordLast, 
    ord1Last: ord1Last, 
    boundedLast: boundedLast, 
    functorLast: functorLast, 
    invariantLast: invariantLast, 
    applyLast: applyLast, 
    applicativeLast: applicativeLast, 
    bindLast: bindLast, 
    monadLast: monadLast, 
    extendLast: extendLast, 
    showLast: showLast, 
    semigroupLast: semigroupLast, 
    monoidLast: monoidLast
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Maybe":122,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],122:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Nothing = (function () {
    function Nothing() {

    };
    Nothing.value = new Nothing();
    return Nothing;
})();
var Just = (function () {
    function Just(value0) {
        this.value0 = value0;
    };
    Just.create = function (value0) {
        return new Just(value0);
    };
    return Just;
})();
var showMaybe = function (dictShow) {
    return new Data_Show.Show(function (v) {
        if (v instanceof Just) {
            return "(Just " + (Data_Show.show(dictShow)(v.value0) + ")");
        };
        if (v instanceof Nothing) {
            return "Nothing";
        };
        throw new Error("Failed pattern match at Data.Maybe line 208, column 3 - line 209, column 3: " + [ v.constructor.name ]);
    });
};
var semigroupMaybe = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            if (v instanceof Nothing) {
                return v1;
            };
            if (v1 instanceof Nothing) {
                return v;
            };
            if (v instanceof Just && v1 instanceof Just) {
                return new Just(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Maybe line 177, column 3 - line 177, column 23: " + [ v.constructor.name, v1.constructor.name ]);
        };
    });
};
var monoidMaybe = function (dictSemigroup) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMaybe(dictSemigroup);
    }, Nothing.value);
};
var maybe$prime = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v(Data_Unit.unit);
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 233, column 1 - line 233, column 28: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var maybe = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v;
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 220, column 1 - line 220, column 22: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isNothing = maybe(true)(Data_Function["const"](false));
var isJust = maybe(false)(Data_Function["const"](true));
var functorMaybe = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Just) {
            return new Just(v(v1.value0));
        };
        return Nothing.value;
    };
});
var invariantMaybe = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorMaybe));
var fromMaybe$prime = function (a) {
    return maybe$prime(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromMaybe = function (a) {
    return maybe(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromJust = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar34) {
                return $dollar34;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Just) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Maybe line 271, column 1 - line 271, column 21: " + [ v.constructor.name ]);
        })());
    };
};
var extendMaybe = new Control_Extend.Extend(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Nothing) {
            return Nothing.value;
        };
        return new Just(v(v1));
    };
});
var eqMaybe = function (dictEq) {
    return new Data_Eq.Eq(function (x) {
        return function (y) {
            if (x instanceof Nothing && y instanceof Nothing) {
                return true;
            };
            if (x instanceof Just && y instanceof Just) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0);
            };
            return false;
        };
    });
};
var ordMaybe = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqMaybe(dictOrd.Eq0());
    }, function (x) {
        return function (y) {
            if (x instanceof Nothing && y instanceof Nothing) {
                return Data_Ordering.EQ.value;
            };
            if (x instanceof Nothing) {
                return Data_Ordering.LT.value;
            };
            if (y instanceof Nothing) {
                return Data_Ordering.GT.value;
            };
            if (x instanceof Just && y instanceof Just) {
                return Data_Ord.compare(dictOrd)(x.value0)(y.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 196, column 1 - line 196, column 51: " + [ x.constructor.name, y.constructor.name ]);
        };
    });
};
var eq1Maybe = new Data_Eq.Eq1(function (dictEq) {
    return Data_Eq.eq(eqMaybe(dictEq));
});
var ord1Maybe = new Data_Ord.Ord1(function () {
    return eq1Maybe;
}, function (dictOrd) {
    return Data_Ord.compare(ordMaybe(dictOrd));
});
var boundedMaybe = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordMaybe(dictBounded.Ord0());
    }, Nothing.value, new Just(Data_Bounded.top(dictBounded)));
};
var applyMaybe = new Control_Apply.Apply(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return Data_Functor.map(functorMaybe)(v.value0)(v1);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 69, column 3 - line 69, column 31: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindMaybe = new Control_Bind.Bind(function () {
    return applyMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return v1(v.value0);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 128, column 3 - line 128, column 24: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var applicativeMaybe = new Control_Applicative.Applicative(function () {
    return applyMaybe;
}, Just.create);
var monadMaybe = new Control_Monad.Monad(function () {
    return applicativeMaybe;
}, function () {
    return bindMaybe;
});
var altMaybe = new Control_Alt.Alt(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Nothing) {
            return v1;
        };
        return v;
    };
});
var plusMaybe = new Control_Plus.Plus(function () {
    return altMaybe;
}, Nothing.value);
var alternativeMaybe = new Control_Alternative.Alternative(function () {
    return applicativeMaybe;
}, function () {
    return plusMaybe;
});
var monadZeroMaybe = new Control_MonadZero.MonadZero(function () {
    return alternativeMaybe;
}, function () {
    return monadMaybe;
});
module.exports = {
    Nothing: Nothing, 
    Just: Just, 
    fromJust: fromJust, 
    fromMaybe: fromMaybe, 
    "fromMaybe'": fromMaybe$prime, 
    isJust: isJust, 
    isNothing: isNothing, 
    maybe: maybe, 
    "maybe'": maybe$prime, 
    functorMaybe: functorMaybe, 
    applyMaybe: applyMaybe, 
    applicativeMaybe: applicativeMaybe, 
    altMaybe: altMaybe, 
    plusMaybe: plusMaybe, 
    alternativeMaybe: alternativeMaybe, 
    bindMaybe: bindMaybe, 
    monadMaybe: monadMaybe, 
    monadZeroMaybe: monadZeroMaybe, 
    extendMaybe: extendMaybe, 
    invariantMaybe: invariantMaybe, 
    semigroupMaybe: semigroupMaybe, 
    monoidMaybe: monoidMaybe, 
    eqMaybe: eqMaybe, 
    eq1Maybe: eq1Maybe, 
    ordMaybe: ordMaybe, 
    ord1Maybe: ord1Maybe, 
    boundedMaybe: boundedMaybe, 
    showMaybe: showMaybe
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Extend":25,"../Control.Monad":61,"../Control.MonadZero":63,"../Control.Plus":66,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Function":102,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Show":145,"../Data.Unit":157,"../Prelude":168}],123:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Additive = function (x) {
    return x;
};
var showAdditive = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Additive " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupAdditive = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.add(dictSemiring)(v)(v1);
        };
    });
};
var ordAdditive = function (dictOrd) {
    return dictOrd;
};
var newtypeAdditive = new Data_Newtype.Newtype(function (n) {
    return n;
}, Additive);
var monoidAdditive = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAdditive(dictSemiring);
    }, Data_Semiring.zero(dictSemiring));
};
var invariantAdditive = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorAdditive = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendAdditive = new Control_Extend.Extend(function () {
    return functorAdditive;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqAdditive = function (dictEq) {
    return dictEq;
};
var comonadAdditive = new Control_Comonad.Comonad(function () {
    return extendAdditive;
}, Data_Newtype.unwrap(newtypeAdditive));
var boundedAdditive = function (dictBounded) {
    return dictBounded;
};
var applyAdditive = new Control_Apply.Apply(function () {
    return functorAdditive;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindAdditive = new Control_Bind.Bind(function () {
    return applyAdditive;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeAdditive = new Control_Applicative.Applicative(function () {
    return applyAdditive;
}, Additive);
var monadAdditive = new Control_Monad.Monad(function () {
    return applicativeAdditive;
}, function () {
    return bindAdditive;
});
module.exports = {
    Additive: Additive, 
    newtypeAdditive: newtypeAdditive, 
    eqAdditive: eqAdditive, 
    ordAdditive: ordAdditive, 
    boundedAdditive: boundedAdditive, 
    functorAdditive: functorAdditive, 
    invariantAdditive: invariantAdditive, 
    applyAdditive: applyAdditive, 
    applicativeAdditive: applicativeAdditive, 
    bindAdditive: bindAdditive, 
    monadAdditive: monadAdditive, 
    extendAdditive: extendAdditive, 
    comonadAdditive: comonadAdditive, 
    showAdditive: showAdditive, 
    semigroupAdditive: semigroupAdditive, 
    monoidAdditive: monoidAdditive
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Prelude":168}],124:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Conj = function (x) {
    return x;
};
var showConj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Conj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringConj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var semigroupConj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var ordConj = function (dictOrd) {
    return dictOrd;
};
var newtypeConj = new Data_Newtype.Newtype(function (n) {
    return n;
}, Conj);
var monoidConj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupConj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var invariantConj = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorConj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendConj = new Control_Extend.Extend(function () {
    return functorConj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqConj = function (dictEq) {
    return dictEq;
};
var comonadConj = new Control_Comonad.Comonad(function () {
    return extendConj;
}, Data_Newtype.unwrap(newtypeConj));
var boundedConj = function (dictBounded) {
    return dictBounded;
};
var applyConj = new Control_Apply.Apply(function () {
    return functorConj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindConj = new Control_Bind.Bind(function () {
    return applyConj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeConj = new Control_Applicative.Applicative(function () {
    return applyConj;
}, Conj);
var monadConj = new Control_Monad.Monad(function () {
    return applicativeConj;
}, function () {
    return bindConj;
});
module.exports = {
    Conj: Conj, 
    newtypeConj: newtypeConj, 
    eqConj: eqConj, 
    ordConj: ordConj, 
    boundedConj: boundedConj, 
    functorConj: functorConj, 
    invariantConj: invariantConj, 
    applyConj: applyConj, 
    applicativeConj: applicativeConj, 
    bindConj: bindConj, 
    monadConj: monadConj, 
    extendConj: extendConj, 
    comonadConj: comonadConj, 
    showConj: showConj, 
    semigroupConj: semigroupConj, 
    monoidConj: monoidConj, 
    semiringConj: semiringConj
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.HeytingAlgebra":111,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Prelude":168}],125:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Disj = function (x) {
    return x;
};
var showDisj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Disj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringDisj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var semigroupDisj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var ordDisj = function (dictOrd) {
    return dictOrd;
};
var newtypeDisj = new Data_Newtype.Newtype(function (n) {
    return n;
}, Disj);
var monoidDisj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDisj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var invariantDisj = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorDisj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDisj = new Control_Extend.Extend(function () {
    return functorDisj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDisj = function (dictEq) {
    return dictEq;
};
var comonadDisj = new Control_Comonad.Comonad(function () {
    return extendDisj;
}, Data_Newtype.unwrap(newtypeDisj));
var boundedDisj = function (dictBounded) {
    return dictBounded;
};
var applyDisj = new Control_Apply.Apply(function () {
    return functorDisj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDisj = new Control_Bind.Bind(function () {
    return applyDisj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDisj = new Control_Applicative.Applicative(function () {
    return applyDisj;
}, Disj);
var monadDisj = new Control_Monad.Monad(function () {
    return applicativeDisj;
}, function () {
    return bindDisj;
});
module.exports = {
    Disj: Disj, 
    newtypeDisj: newtypeDisj, 
    eqDisj: eqDisj, 
    ordDisj: ordDisj, 
    boundedDisj: boundedDisj, 
    functorDisj: functorDisj, 
    invariantDisj: invariantDisj, 
    applyDisj: applyDisj, 
    applicativeDisj: applicativeDisj, 
    bindDisj: bindDisj, 
    monadDisj: monadDisj, 
    extendDisj: extendDisj, 
    comonadDisj: comonadDisj, 
    showDisj: showDisj, 
    semigroupDisj: semigroupDisj, 
    monoidDisj: monoidDisj, 
    semiringDisj: semiringDisj
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.HeytingAlgebra":111,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Prelude":168}],126:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Dual = function (x) {
    return x;
};
var showDual = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Dual " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupDual = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semigroup.append(dictSemigroup)(v1)(v);
        };
    });
};
var ordDual = function (dictOrd) {
    return dictOrd;
};
var newtypeDual = new Data_Newtype.Newtype(function (n) {
    return n;
}, Dual);
var monoidDual = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDual(dictMonoid.Semigroup0());
    }, Data_Monoid.mempty(dictMonoid));
};
var invariantDual = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorDual = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDual = new Control_Extend.Extend(function () {
    return functorDual;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDual = function (dictEq) {
    return dictEq;
};
var comonadDual = new Control_Comonad.Comonad(function () {
    return extendDual;
}, Data_Newtype.unwrap(newtypeDual));
var boundedDual = function (dictBounded) {
    return dictBounded;
};
var applyDual = new Control_Apply.Apply(function () {
    return functorDual;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDual = new Control_Bind.Bind(function () {
    return applyDual;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDual = new Control_Applicative.Applicative(function () {
    return applyDual;
}, Dual);
var monadDual = new Control_Monad.Monad(function () {
    return applicativeDual;
}, function () {
    return bindDual;
});
module.exports = {
    Dual: Dual, 
    newtypeDual: newtypeDual, 
    eqDual: eqDual, 
    ordDual: ordDual, 
    boundedDual: boundedDual, 
    functorDual: functorDual, 
    invariantDual: invariantDual, 
    applyDual: applyDual, 
    applicativeDual: applicativeDual, 
    bindDual: bindDual, 
    monadDual: monadDual, 
    extendDual: extendDual, 
    comonadDual: comonadDual, 
    showDual: showDual, 
    semigroupDual: semigroupDual, 
    monoidDual: monoidDual
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Show":145,"../Prelude":168}],127:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Semigroup = require("../Data.Semigroup");
var Prelude = require("../Prelude");
var Endo = function (x) {
    return x;
};
var semigroupEndo = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function ($11) {
            return v(v1($11));
        };
    };
});
var newtypeEndo = new Data_Newtype.Newtype(function (n) {
    return n;
}, Endo);
var monoidEndo = new Data_Monoid.Monoid(function () {
    return semigroupEndo;
}, Control_Category.id(Control_Category.categoryFn));
var invariantEndo = new Data_Functor_Invariant.Invariant(function (ab) {
    return function (ba) {
        return function (v) {
            return function ($12) {
                return ab(v(ba($12)));
            };
        };
    };
});
module.exports = {
    Endo: Endo, 
    newtypeEndo: newtypeEndo, 
    invariantEndo: invariantEndo, 
    semigroupEndo: semigroupEndo, 
    monoidEndo: monoidEndo
};

},{"../Control.Category":21,"../Control.Semigroupoid":67,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Semigroup":141,"../Prelude":168}],128:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Multiplicative = function (x) {
    return x;
};
var showMultiplicative = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Multiplicative " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupMultiplicative = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.mul(dictSemiring)(v)(v1);
        };
    });
};
var ordMultiplicative = function (dictOrd) {
    return dictOrd;
};
var newtypeMultiplicative = new Data_Newtype.Newtype(function (n) {
    return n;
}, Multiplicative);
var monoidMultiplicative = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMultiplicative(dictSemiring);
    }, Data_Semiring.one(dictSemiring));
};
var invariantMultiplicative = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorMultiplicative = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendMultiplicative = new Control_Extend.Extend(function () {
    return functorMultiplicative;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqMultiplicative = function (dictEq) {
    return dictEq;
};
var comonadMultiplicative = new Control_Comonad.Comonad(function () {
    return extendMultiplicative;
}, Data_Newtype.unwrap(newtypeMultiplicative));
var boundedMultiplicative = function (dictBounded) {
    return dictBounded;
};
var applyMultiplicative = new Control_Apply.Apply(function () {
    return functorMultiplicative;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindMultiplicative = new Control_Bind.Bind(function () {
    return applyMultiplicative;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeMultiplicative = new Control_Applicative.Applicative(function () {
    return applyMultiplicative;
}, Multiplicative);
var monadMultiplicative = new Control_Monad.Monad(function () {
    return applicativeMultiplicative;
}, function () {
    return bindMultiplicative;
});
module.exports = {
    Multiplicative: Multiplicative, 
    newtypeMultiplicative: newtypeMultiplicative, 
    eqMultiplicative: eqMultiplicative, 
    ordMultiplicative: ordMultiplicative, 
    boundedMultiplicative: boundedMultiplicative, 
    functorMultiplicative: functorMultiplicative, 
    invariantMultiplicative: invariantMultiplicative, 
    applyMultiplicative: applyMultiplicative, 
    applicativeMultiplicative: applicativeMultiplicative, 
    bindMultiplicative: bindMultiplicative, 
    monadMultiplicative: monadMultiplicative, 
    extendMultiplicative: extendMultiplicative, 
    comonadMultiplicative: comonadMultiplicative, 
    showMultiplicative: showMultiplicative, 
    semigroupMultiplicative: semigroupMultiplicative, 
    monoidMultiplicative: monoidMultiplicative
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":87,"../Data.Eq":92,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Prelude":168}],129:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Boolean = require("../Data.Boolean");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Function = require("../Data.Function");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Monoid = function (Semigroup0, mempty) {
    this.Semigroup0 = Semigroup0;
    this.mempty = mempty;
};
var monoidUnit = new Monoid(function () {
    return Data_Semigroup.semigroupUnit;
}, Data_Unit.unit);
var monoidString = new Monoid(function () {
    return Data_Semigroup.semigroupString;
}, "");
var monoidArray = new Monoid(function () {
    return Data_Semigroup.semigroupArray;
}, [  ]);
var mempty = function (dict) {
    return dict.mempty;
};
var monoidFn = function (dictMonoid) {
    return new Monoid(function () {
        return Data_Semigroup.semigroupFn(dictMonoid.Semigroup0());
    }, Data_Function["const"](mempty(dictMonoid)));
};
var power = function (dictMonoid) {
    return function (x) {
        var go = function (p) {
            if (p <= 0) {
                return mempty(dictMonoid);
            };
            if (p === 1) {
                return x;
            };
            if (p % 2 === 0) {
                var x$prime = go(p / 2 | 0);
                return Data_Semigroup.append(dictMonoid.Semigroup0())(x$prime)(x$prime);
            };
            if (Data_Boolean.otherwise) {
                var x$prime = go(p / 2 | 0);
                return Data_Semigroup.append(dictMonoid.Semigroup0())(x$prime)(Data_Semigroup.append(dictMonoid.Semigroup0())(x$prime)(x));
            };
            throw new Error("Failed pattern match at Data.Monoid line 49, column 3 - line 53, column 57: " + [ p.constructor.name ]);
        };
        return go;
    };
};
module.exports = {
    Monoid: Monoid, 
    mempty: mempty, 
    power: power, 
    monoidUnit: monoidUnit, 
    monoidFn: monoidFn, 
    monoidString: monoidString, 
    monoidArray: monoidArray
};

},{"../Data.Boolean":84,"../Data.Eq":92,"../Data.EuclideanRing":94,"../Data.Function":102,"../Data.Ord":136,"../Data.Semigroup":141,"../Data.Unit":157,"../Prelude":168}],130:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
module.exports = {};

},{}],131:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Prelude = require("../Prelude");
var Newtype = function (unwrap, wrap) {
    this.unwrap = unwrap;
    this.wrap = wrap;
};
var wrap = function (dict) {
    return dict.wrap;
};
var unwrap = function (dict) {
    return dict.unwrap;
};
var underF2 = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($50) {
                            return function ($51) {
                                return Data_Functor.map(dictFunctor1)(unwrap(dictNewtype1))(Data_Function.on(f)(Data_Functor.map(dictFunctor)(wrap(dictNewtype)))($50)($51));
                            };
                        };
                    };
                };
            };
        };
    };
};
var underF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($52) {
                            return Data_Functor.map(dictFunctor1)(unwrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(wrap(dictNewtype))($52)));
                        };
                    };
                };
            };
        };
    };
};
var under2 = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($53) {
                    return function ($54) {
                        return unwrap(dictNewtype1)(Data_Function.on(f)(wrap(dictNewtype))($53)($54));
                    };
                };
            };
        };
    };
};
var under = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($55) {
                    return unwrap(dictNewtype1)(f(wrap(dictNewtype)($55)));
                };
            };
        };
    };
};
var un = function (dictNewtype) {
    return function (v) {
        return unwrap(dictNewtype);
    };
};
var traverse = function (dictFunctor) {
    return function (dictNewtype) {
        return function (v) {
            return function (f) {
                return function ($56) {
                    return Data_Functor.map(dictFunctor)(wrap(dictNewtype))(f(unwrap(dictNewtype)($56)));
                };
            };
        };
    };
};
var overF2 = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($57) {
                            return function ($58) {
                                return Data_Functor.map(dictFunctor1)(wrap(dictNewtype1))(Data_Function.on(f)(Data_Functor.map(dictFunctor)(unwrap(dictNewtype)))($57)($58));
                            };
                        };
                    };
                };
            };
        };
    };
};
var overF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($59) {
                            return Data_Functor.map(dictFunctor1)(wrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(unwrap(dictNewtype))($59)));
                        };
                    };
                };
            };
        };
    };
};
var over2 = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($60) {
                    return function ($61) {
                        return wrap(dictNewtype1)(Data_Function.on(f)(unwrap(dictNewtype))($60)($61));
                    };
                };
            };
        };
    };
};
var over = function (dictNewtype) {
    return function (dictNewtype1) {
        return function (v) {
            return function (f) {
                return function ($62) {
                    return wrap(dictNewtype1)(f(unwrap(dictNewtype)($62)));
                };
            };
        };
    };
};
var op = function (dictNewtype) {
    return un(dictNewtype);
};
var collect = function (dictFunctor) {
    return function (dictNewtype) {
        return function (v) {
            return function (f) {
                return function ($63) {
                    return wrap(dictNewtype)(f(Data_Functor.map(dictFunctor)(unwrap(dictNewtype))($63)));
                };
            };
        };
    };
};
var alaF = function (dictFunctor) {
    return function (dictFunctor1) {
        return function (dictNewtype) {
            return function (dictNewtype1) {
                return function (v) {
                    return function (f) {
                        return function ($64) {
                            return Data_Functor.map(dictFunctor1)(unwrap(dictNewtype1))(f(Data_Functor.map(dictFunctor)(wrap(dictNewtype))($64)));
                        };
                    };
                };
            };
        };
    };
};
var ala = function (dictFunctor) {
    return function (dictNewtype) {
        return function (dictNewtype1) {
            return function (v) {
                return function (f) {
                    return Data_Functor.map(dictFunctor)(unwrap(dictNewtype))(f(wrap(dictNewtype1)));
                };
            };
        };
    };
};
module.exports = {
    Newtype: Newtype, 
    ala: ala, 
    alaF: alaF, 
    collect: collect, 
    op: op, 
    over: over, 
    over2: over2, 
    overF: overF, 
    overF2: overF2, 
    traverse: traverse, 
    un: un, 
    under: under, 
    under2: under2, 
    underF: underF, 
    underF2: underF2, 
    unwrap: unwrap, 
    wrap: wrap
};

},{"../Control.Semigroupoid":67,"../Data.Function":102,"../Data.Functor":107,"../Prelude":168}],132:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Plus = require("../Control.Plus");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Prelude = require("../Prelude");
var NonEmpty = (function () {
    function NonEmpty(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    NonEmpty.create = function (value0) {
        return function (value1) {
            return new NonEmpty(value0, value1);
        };
    };
    return NonEmpty;
})();
var tail = function (v) {
    return v.value1;
};
var singleton = function (dictPlus) {
    return function (a) {
        return new NonEmpty(a, Control_Plus.empty(dictPlus));
    };
};
var showNonEmpty = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(NonEmpty " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var oneOf = function (dictAlternative) {
    return function (v) {
        return Control_Alt.alt((dictAlternative.Plus1()).Alt0())(Control_Applicative.pure(dictAlternative.Applicative0())(v.value0))(v.value1);
    };
};
var head = function (v) {
    return v.value0;
};
var functorNonEmpty = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return new NonEmpty(f(v.value0), Data_Functor.map(dictFunctor)(f)(v.value1));
        };
    });
};
var fromNonEmpty = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var foldl1 = function (dictFoldable) {
    return function (f) {
        return function (v) {
            return Data_Foldable.foldl(dictFoldable)(f)(v.value0)(v.value1);
        };
    };
};
var foldableNonEmpty = function (dictFoldable) {
    return new Data_Foldable.Foldable(function (dictMonoid) {
        return function (f) {
            return function (v) {
                return Data_Semigroup.append(dictMonoid.Semigroup0())(f(v.value0))(Data_Foldable.foldMap(dictFoldable)(dictMonoid)(f)(v.value1));
            };
        };
    }, function (f) {
        return function (b) {
            return function (v) {
                return Data_Foldable.foldl(dictFoldable)(f)(f(b)(v.value0))(v.value1);
            };
        };
    }, function (f) {
        return function (b) {
            return function (v) {
                return f(v.value0)(Data_Foldable.foldr(dictFoldable)(f)(b)(v.value1));
            };
        };
    });
};
var traversableNonEmpty = function (dictTraversable) {
    return new Data_Traversable.Traversable(function () {
        return foldableNonEmpty(dictTraversable.Foldable1());
    }, function () {
        return functorNonEmpty(dictTraversable.Functor0());
    }, function (dictApplicative) {
        return function (v) {
            return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(NonEmpty.create)(v.value0))(Data_Traversable.sequence(dictTraversable)(dictApplicative)(v.value1));
        };
    }, function (dictApplicative) {
        return function (f) {
            return function (v) {
                return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(NonEmpty.create)(f(v.value0)))(Data_Traversable.traverse(dictTraversable)(dictApplicative)(f)(v.value1));
            };
        };
    });
};
var foldMap1 = function (dictSemigroup) {
    return function (dictFoldable) {
        return function (f) {
            return function (v) {
                return Data_Foldable.foldl(dictFoldable)(function (s) {
                    return function (a1) {
                        return Data_Semigroup.append(dictSemigroup)(s)(f(a1));
                    };
                })(f(v.value0))(v.value1);
            };
        };
    };
};
var fold1 = function (dictSemigroup) {
    return function (dictFoldable) {
        return foldMap1(dictSemigroup)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var eq1NonEmpty = function (dictEq1) {
    return new Data_Eq.Eq1(function (dictEq) {
        return function (v) {
            return function (v1) {
                return Data_Eq.eq(dictEq)(v.value0)(v1.value0) && Data_Eq.eq1(dictEq1)(dictEq)(v.value1)(v1.value1);
            };
        };
    });
};
var eqNonEmpty = function (dictEq1) {
    return function (dictEq) {
        return new Data_Eq.Eq(Data_Eq.eq1(eq1NonEmpty(dictEq1))(dictEq));
    };
};
var ord1NonEmpty = function (dictOrd1) {
    return new Data_Ord.Ord1(function () {
        return eq1NonEmpty(dictOrd1.Eq10());
    }, function (dictOrd) {
        return function (v) {
            return function (v1) {
                var v2 = Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                if (v2 instanceof Data_Ordering.EQ) {
                    return Data_Ord.compare1(dictOrd1)(dictOrd)(v.value1)(v1.value1);
                };
                return v2;
            };
        };
    });
};
var ordNonEmpty = function (dictOrd1) {
    return function (dictOrd) {
        return new Data_Ord.Ord(function () {
            return eqNonEmpty(dictOrd1.Eq10())(dictOrd.Eq0());
        }, Data_Ord.compare1(ord1NonEmpty(dictOrd1))(dictOrd));
    };
};
module.exports = {
    NonEmpty: NonEmpty, 
    fold1: fold1, 
    foldMap1: foldMap1, 
    foldl1: foldl1, 
    fromNonEmpty: fromNonEmpty, 
    head: head, 
    oneOf: oneOf, 
    singleton: singleton, 
    tail: tail, 
    showNonEmpty: showNonEmpty, 
    eqNonEmpty: eqNonEmpty, 
    eq1NonEmpty: eq1NonEmpty, 
    ordNonEmpty: ordNonEmpty, 
    ord1NonEmpty: ord1NonEmpty, 
    functorNonEmpty: functorNonEmpty, 
    foldableNonEmpty: foldableNonEmpty, 
    traversableNonEmpty: traversableNonEmpty
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Plus":66,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Semigroup":141,"../Data.Show":145,"../Data.Traversable":152,"../Prelude":168}],133:[function(require,module,exports){
"use strict";

exports.unsafeCompareImpl = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (x) {
        return function (y) {
          return x < y ? lt : x === y ? eq : gt;
        };
      };
    };
  };
};

},{}],134:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Ordering = require("../Data.Ordering");
var unsafeCompare = $foreign.unsafeCompareImpl(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
module.exports = {
    unsafeCompare: unsafeCompare
};

},{"../Data.Ordering":137,"./foreign":133}],135:[function(require,module,exports){
"use strict";

exports.ordArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var x = xs[i];
        var y = ys[i];
        var o = f(x)(y);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

},{}],136:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Ord_Unsafe = require("../Data.Ord.Unsafe");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Ord = function (Eq0, compare) {
    this.Eq0 = Eq0;
    this.compare = compare;
};
var Ord1 = function (Eq10, compare1) {
    this.Eq10 = Eq10;
    this.compare1 = compare1;
};
var ordVoid = new Ord(function () {
    return Data_Eq.eqVoid;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordUnit = new Ord(function () {
    return Data_Eq.eqUnit;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordString = new Ord(function () {
    return Data_Eq.eqString;
}, Data_Ord_Unsafe.unsafeCompare);
var ordOrdering = new Ord(function () {
    return Data_Ordering.eqOrdering;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Ordering.LT && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.EQ) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.GT && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.LT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.GT) {
            return Data_Ordering.GT.value;
        };
        throw new Error("Failed pattern match at Data.Ord line 69, column 3 - line 69, column 21: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var ordNumber = new Ord(function () {
    return Data_Eq.eqNumber;
}, Data_Ord_Unsafe.unsafeCompare);
var ordInt = new Ord(function () {
    return Data_Eq.eqInt;
}, Data_Ord_Unsafe.unsafeCompare);
var ordChar = new Ord(function () {
    return Data_Eq.eqChar;
}, Data_Ord_Unsafe.unsafeCompare);
var ordBoolean = new Ord(function () {
    return Data_Eq.eqBoolean;
}, Data_Ord_Unsafe.unsafeCompare);
var compare1 = function (dict) {
    return dict.compare1;
};
var compare = function (dict) {
    return dict.compare;
};
var comparing = function (dictOrd) {
    return function (f) {
        return Data_Function.on(compare(dictOrd))(f);
    };
};
var greaterThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var v = compare(dictOrd)(a1)(a2);
            if (v instanceof Data_Ordering.GT) {
                return true;
            };
            return false;
        };
    };
};
var greaterThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var v = compare(dictOrd)(a1)(a2);
            if (v instanceof Data_Ordering.LT) {
                return false;
            };
            return true;
        };
    };
};
var signum = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $32 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing.Semiring0()));
            if ($32) {
                return Data_Semiring.one(dictRing.Semiring0());
            };
            return Data_Ring.negate(dictRing)(Data_Semiring.one(dictRing.Semiring0()));
        };
    };
};
var lessThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var v = compare(dictOrd)(a1)(a2);
            if (v instanceof Data_Ordering.LT) {
                return true;
            };
            return false;
        };
    };
};
var lessThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var v = compare(dictOrd)(a1)(a2);
            if (v instanceof Data_Ordering.GT) {
                return false;
            };
            return true;
        };
    };
};
var max = function (dictOrd) {
    return function (x) {
        return function (y) {
            var v = compare(dictOrd)(x)(y);
            if (v instanceof Data_Ordering.LT) {
                return y;
            };
            if (v instanceof Data_Ordering.EQ) {
                return x;
            };
            if (v instanceof Data_Ordering.GT) {
                return x;
            };
            throw new Error("Failed pattern match at Data.Ord line 123, column 3 - line 126, column 12: " + [ v.constructor.name ]);
        };
    };
};
var min = function (dictOrd) {
    return function (x) {
        return function (y) {
            var v = compare(dictOrd)(x)(y);
            if (v instanceof Data_Ordering.LT) {
                return x;
            };
            if (v instanceof Data_Ordering.EQ) {
                return x;
            };
            if (v instanceof Data_Ordering.GT) {
                return y;
            };
            throw new Error("Failed pattern match at Data.Ord line 114, column 3 - line 117, column 12: " + [ v.constructor.name ]);
        };
    };
};
var ordArray = function (dictOrd) {
    return new Ord(function () {
        return Data_Eq.eqArray(dictOrd.Eq0());
    }, (function () {
        var toDelta = function (x) {
            return function (y) {
                var v = compare(dictOrd)(x)(y);
                if (v instanceof Data_Ordering.EQ) {
                    return 0;
                };
                if (v instanceof Data_Ordering.LT) {
                    return 1;
                };
                if (v instanceof Data_Ordering.GT) {
                    return -1 | 0;
                };
                throw new Error("Failed pattern match at Data.Ord line 61, column 7 - line 66, column 1: " + [ v.constructor.name ]);
            };
        };
        return function (xs) {
            return function (ys) {
                return compare(ordInt)(0)($foreign.ordArrayImpl(toDelta)(xs)(ys));
            };
        };
    })());
};
var ord1Array = new Ord1(function () {
    return Data_Eq.eq1Array;
}, function (dictOrd) {
    return compare(ordArray(dictOrd));
});
var clamp = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                return min(dictOrd)(hi)(max(dictOrd)(low)(x));
            };
        };
    };
};
var between = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                if (lessThan(dictOrd)(x)(low)) {
                    return false;
                };
                if (greaterThan(dictOrd)(x)(hi)) {
                    return false;
                };
                return true;
            };
        };
    };
};
var abs = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $41 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing.Semiring0()));
            if ($41) {
                return x;
            };
            return Data_Ring.negate(dictRing)(x);
        };
    };
};
module.exports = {
    Ord: Ord, 
    Ord1: Ord1, 
    abs: abs, 
    between: between, 
    clamp: clamp, 
    compare: compare, 
    compare1: compare1, 
    comparing: comparing, 
    greaterThan: greaterThan, 
    greaterThanOrEq: greaterThanOrEq, 
    lessThan: lessThan, 
    lessThanOrEq: lessThanOrEq, 
    max: max, 
    min: min, 
    signum: signum, 
    ordBoolean: ordBoolean, 
    ordInt: ordInt, 
    ordNumber: ordNumber, 
    ordString: ordString, 
    ordChar: ordChar, 
    ordUnit: ordUnit, 
    ordVoid: ordVoid, 
    ordArray: ordArray, 
    ordOrdering: ordOrdering, 
    ord1Array: ord1Array
};

},{"../Data.Eq":92,"../Data.Function":102,"../Data.Ord.Unsafe":134,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semiring":143,"../Data.Unit":157,"../Data.Void":158,"./foreign":135}],137:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Eq = require("../Data.Eq");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var LT = (function () {
    function LT() {

    };
    LT.value = new LT();
    return LT;
})();
var GT = (function () {
    function GT() {

    };
    GT.value = new GT();
    return GT;
})();
var EQ = (function () {
    function EQ() {

    };
    EQ.value = new EQ();
    return EQ;
})();
var showOrdering = new Data_Show.Show(function (v) {
    if (v instanceof LT) {
        return "LT";
    };
    if (v instanceof GT) {
        return "GT";
    };
    if (v instanceof EQ) {
        return "EQ";
    };
    throw new Error("Failed pattern match at Data.Ordering line 27, column 3 - line 28, column 3: " + [ v.constructor.name ]);
});
var semigroupOrdering = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof LT) {
            return LT.value;
        };
        if (v instanceof GT) {
            return GT.value;
        };
        if (v instanceof EQ) {
            return v1;
        };
        throw new Error("Failed pattern match at Data.Ordering line 22, column 3 - line 22, column 19: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invert = function (v) {
    if (v instanceof GT) {
        return LT.value;
    };
    if (v instanceof EQ) {
        return EQ.value;
    };
    if (v instanceof LT) {
        return GT.value;
    };
    throw new Error("Failed pattern match at Data.Ordering line 34, column 1 - line 34, column 15: " + [ v.constructor.name ]);
};
var eqOrdering = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof LT && v1 instanceof LT) {
            return true;
        };
        if (v instanceof GT && v1 instanceof GT) {
            return true;
        };
        if (v instanceof EQ && v1 instanceof EQ) {
            return true;
        };
        return false;
    };
});
module.exports = {
    LT: LT, 
    GT: GT, 
    EQ: EQ, 
    invert: invert, 
    eqOrdering: eqOrdering, 
    semigroupOrdering: semigroupOrdering, 
    showOrdering: showOrdering
};

},{"../Data.Eq":92,"../Data.Semigroup":141,"../Data.Show":145}],138:[function(require,module,exports){
"use strict";

exports.intSub = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x - y | 0;
  };
};

exports.numSub = function (n1) {
  return function (n2) {
    return n1 - n2;
  };
};

},{}],139:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Ring = function (Semiring0, sub) {
    this.Semiring0 = Semiring0;
    this.sub = sub;
};
var sub = function (dict) {
    return dict.sub;
};
var ringUnit = new Ring(function () {
    return Data_Semiring.semiringUnit;
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var ringNumber = new Ring(function () {
    return Data_Semiring.semiringNumber;
}, $foreign.numSub);
var ringInt = new Ring(function () {
    return Data_Semiring.semiringInt;
}, $foreign.intSub);
var ringFn = function (dictRing) {
    return new Ring(function () {
        return Data_Semiring.semiringFn(dictRing.Semiring0());
    }, function (f) {
        return function (g) {
            return function (x) {
                return sub(dictRing)(f(x))(g(x));
            };
        };
    });
};
var negate = function (dictRing) {
    return function (a) {
        return sub(dictRing)(Data_Semiring.zero(dictRing.Semiring0()))(a);
    };
};
module.exports = {
    Ring: Ring, 
    negate: negate, 
    sub: sub, 
    ringInt: ringInt, 
    ringNumber: ringNumber, 
    ringUnit: ringUnit, 
    ringFn: ringFn
};

},{"../Data.Semiring":143,"../Data.Unit":157,"./foreign":138}],140:[function(require,module,exports){
"use strict";

exports.concatString = function (s1) {
  return function (s2) {
    return s1 + s2;
  };
};

exports.concatArray = function (xs) {
  return function (ys) {
    if (xs.length === 0) return ys;
    if (ys.length === 0) return xs;
    return xs.concat(ys);
  };
};

},{}],141:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Semigroup = function (append) {
    this.append = append;
};
var semigroupVoid = new Semigroup(function (v) {
    return Data_Void.absurd;
});
var semigroupUnit = new Semigroup(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var semigroupString = new Semigroup($foreign.concatString);
var semigroupArray = new Semigroup($foreign.concatArray);
var append = function (dict) {
    return dict.append;
};
var semigroupFn = function (dictSemigroup) {
    return new Semigroup(function (f) {
        return function (g) {
            return function (x) {
                return append(dictSemigroup)(f(x))(g(x));
            };
        };
    });
};
module.exports = {
    Semigroup: Semigroup, 
    append: append, 
    semigroupString: semigroupString, 
    semigroupUnit: semigroupUnit, 
    semigroupVoid: semigroupVoid, 
    semigroupFn: semigroupFn, 
    semigroupArray: semigroupArray
};

},{"../Data.Unit":157,"../Data.Void":158,"./foreign":140}],142:[function(require,module,exports){
"use strict";

exports.intAdd = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x + y | 0;
  };
};

exports.intMul = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x * y | 0;
  };
};

exports.numAdd = function (n1) {
  return function (n2) {
    return n1 + n2;
  };
};

exports.numMul = function (n1) {
  return function (n2) {
    return n1 * n2;
  };
};

},{}],143:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Semiring = function (add, mul, one, zero) {
    this.add = add;
    this.mul = mul;
    this.one = one;
    this.zero = zero;
};
var zero = function (dict) {
    return dict.zero;
};
var semiringUnit = new Semiring(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, Data_Unit.unit);
var semiringNumber = new Semiring($foreign.numAdd, $foreign.numMul, 1.0, 0.0);
var semiringInt = new Semiring($foreign.intAdd, $foreign.intMul, 1, 0);
var one = function (dict) {
    return dict.one;
};
var mul = function (dict) {
    return dict.mul;
};
var add = function (dict) {
    return dict.add;
};
var semiringFn = function (dictSemiring) {
    return new Semiring(function (f) {
        return function (g) {
            return function (x) {
                return add(dictSemiring)(f(x))(g(x));
            };
        };
    }, function (f) {
        return function (g) {
            return function (x) {
                return mul(dictSemiring)(f(x))(g(x));
            };
        };
    }, function (v) {
        return one(dictSemiring);
    }, function (v) {
        return zero(dictSemiring);
    });
};
module.exports = {
    Semiring: Semiring, 
    add: add, 
    mul: mul, 
    one: one, 
    zero: zero, 
    semiringInt: semiringInt, 
    semiringNumber: semiringNumber, 
    semiringFn: semiringFn, 
    semiringUnit: semiringUnit
};

},{"../Data.Unit":157,"./foreign":142}],144:[function(require,module,exports){
"use strict";

exports.showIntImpl = function (n) {
  return n.toString();
};

exports.showNumberImpl = function (n) {
  var str = n.toString();
  return isNaN(str + ".0") ? str : str + ".0";
};

exports.showCharImpl = function (c) {
  var code = c.charCodeAt(0);
  if (code < 0x20 || code === 0x7F) {
    switch (c) {
      case "\x07": return "'\\a'";
      case "\b": return "'\\b'";
      case "\f": return "'\\f'";
      case "\n": return "'\\n'";
      case "\r": return "'\\r'";
      case "\t": return "'\\t'";
      case "\v": return "'\\v'";
    }
    return "'\\" + code.toString(10) + "'";
  }
  return c === "'" || c === "\\" ? "'\\" + c + "'" : "'" + c + "'";
};

exports.showStringImpl = function (s) {
  var l = s.length;
  return "\"" + s.replace(
    /[\0-\x1F\x7F"\\]/g, // eslint-disable-line no-control-regex
    function (c, i) {
      switch (c) {
        case "\"":
        case "\\":
          return "\\" + c;
        case "\x07": return "\\a";
        case "\b": return "\\b";
        case "\f": return "\\f";
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\t": return "\\t";
        case "\v": return "\\v";
      }
      var k = i + 1;
      var empty = k < l && s[k] >= "0" && s[k] <= "9" ? "\\&" : "";
      return "\\" + c.charCodeAt(0).toString(10) + empty;
    }
  ) + "\"";
};

exports.showArrayImpl = function (f) {
  return function (xs) {
    var ss = [];
    for (var i = 0, l = xs.length; i < l; i++) {
      ss[i] = f(xs[i]);
    }
    return "[" + ss.join(",") + "]";
  };
};

},{}],145:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Show = function (show) {
    this.show = show;
};
var showString = new Show($foreign.showStringImpl);
var showNumber = new Show($foreign.showNumberImpl);
var showInt = new Show($foreign.showIntImpl);
var showChar = new Show($foreign.showCharImpl);
var showBoolean = new Show(function (v) {
    if (v) {
        return "true";
    };
    if (!v) {
        return "false";
    };
    throw new Error("Failed pattern match at Data.Show line 13, column 3 - line 14, column 3: " + [ v.constructor.name ]);
});
var show = function (dict) {
    return dict.show;
};
var showArray = function (dictShow) {
    return new Show($foreign.showArrayImpl(show(dictShow)));
};
module.exports = {
    Show: Show, 
    show: show, 
    showBoolean: showBoolean, 
    showInt: showInt, 
    showNumber: showNumber, 
    showChar: showChar, 
    showString: showString, 
    showArray: showArray
};

},{"./foreign":144}],146:[function(require,module,exports){
"use strict";

exports.charCodeAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charCodeAt(i);
    throw new Error("Data.String.Unsafe.charCodeAt: Invalid index.");
  };
};

exports.charAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charAt(i);
    throw new Error("Data.String.Unsafe.charAt: Invalid index.");
  };
};

exports.char = function (s) {
  if (s.length === 1) return s.charAt(0);
  throw new Error("Data.String.Unsafe.char: Expected string of length 1.");
};

},{}],147:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
module.exports = {
    "char": $foreign["char"], 
    charAt: $foreign.charAt, 
    charCodeAt: $foreign.charCodeAt
};

},{"./foreign":146}],148:[function(require,module,exports){
"use strict";

exports._charAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charAt(i)) : nothing;
      };
    };
  };
};

exports.singleton = function (c) {
  return c;
};

exports._charCodeAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charCodeAt(i)) : nothing;
      };
    };
  };
};

exports._toChar = function (just) {
  return function (nothing) {
    return function (s) {
      return s.length === 1 ? just(s) : nothing;
    };
  };
};

exports.fromCharArray = function (a) {
  return a.join("");
};

exports._indexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.indexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_indexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.indexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports._lastIndexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.lastIndexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_lastIndexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.lastIndexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports.length = function (s) {
  return s.length;
};

exports._localeCompare = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (s1) {
        return function (s2) {
          var result = s1.localeCompare(s2);
          return result < 0 ? lt : result > 0 ? gt : eq;
        };
      };
    };
  };
};

exports.replace = function (s1) {
  return function (s2) {
    return function (s3) {
      return s3.replace(s1, s2);
    };
  };
};

exports.replaceAll = function (s1) {
  return function (s2) {
    return function (s3) {
      return s3.replace(new RegExp(s1.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"), s2);
    };
  };
};

exports.take = function (n) {
  return function (s) {
    return s.substr(0, n);
  };
};

exports.drop = function (n) {
  return function (s) {
    return s.substring(n);
  };
};

exports.count = function (p) {
  return function (s) {
    var i = 0;
    while (i < s.length && p(s.charAt(i))) i++;
    return i;
  };
};

exports.split = function (sep) {
  return function (s) {
    return s.split(sep);
  };
};

exports._splitAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ?
               just({ before: s.substring(0, i), after: s.substring(i) }) :
               nothing;
      };
    };
  };
};

exports.toCharArray = function (s) {
  return s.split("");
};

exports.toLower = function (s) {
  return s.toLowerCase();
};

exports.toUpper = function (s) {
  return s.toUpperCase();
};

exports.trim = function (s) {
  return s.trim();
};

exports.joinWith = function (s) {
  return function (xs) {
    return xs.join(s);
  };
};

},{}],149:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Maybe = require("../Data.Maybe");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_String_Unsafe = require("../Data.String.Unsafe");
var Prelude = require("../Prelude");
var Replacement = function (x) {
    return x;
};
var Pattern = function (x) {
    return x;
};
var uncons = function (v) {
    if (v === "") {
        return Data_Maybe.Nothing.value;
    };
    return new Data_Maybe.Just({
        head: Data_String_Unsafe.charAt(0)(v), 
        tail: $foreign.drop(1)(v)
    });
};
var toChar = $foreign._toChar(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var takeWhile = function (p) {
    return function (s) {
        return $foreign.take($foreign.count(p)(s))(s);
    };
};
var splitAt = $foreign._splitAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var showReplacement = new Data_Show.Show(function (v) {
    return "(Replacement " + (v + ")");
});
var showPattern = new Data_Show.Show(function (v) {
    return "(Pattern " + (v + ")");
});
var $$null = function (s) {
    return s === "";
};
var newtypeReplacement = new Data_Newtype.Newtype(function (n) {
    return n;
}, Replacement);
var newtypePattern = new Data_Newtype.Newtype(function (n) {
    return n;
}, Pattern);
var localeCompare = $foreign._localeCompare(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
var lastIndexOf$prime = $foreign["_lastIndexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var lastIndexOf = $foreign._lastIndexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripSuffix = function (v) {
    return function (str) {
        var v1 = lastIndexOf(v)(str);
        if (v1 instanceof Data_Maybe.Just && v1.value0 === ($foreign.length(str) - $foreign.length(v) | 0)) {
            return Data_Maybe.Just.create($foreign.take(v1.value0)(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var indexOf$prime = $foreign["_indexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var indexOf = $foreign._indexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripPrefix = function (v) {
    return function (str) {
        var v1 = indexOf(v)(str);
        if (v1 instanceof Data_Maybe.Just && v1.value0 === 0) {
            return Data_Maybe.Just.create($foreign.drop($foreign.length(v))(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var eqReplacement = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordReplacement = new Data_Ord.Ord(function () {
    return eqReplacement;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordString)(x)(y);
    };
});
var eqPattern = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordPattern = new Data_Ord.Ord(function () {
    return eqPattern;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordString)(x)(y);
    };
});
var dropWhile = function (p) {
    return function (s) {
        return $foreign.drop($foreign.count(p)(s))(s);
    };
};
var contains = function (pat) {
    return function ($48) {
        return Data_Maybe.isJust(indexOf(pat)($48));
    };
};
var charCodeAt = $foreign._charCodeAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var charAt = $foreign._charAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
module.exports = {
    Pattern: Pattern, 
    Replacement: Replacement, 
    charAt: charAt, 
    charCodeAt: charCodeAt, 
    contains: contains, 
    dropWhile: dropWhile, 
    indexOf: indexOf, 
    "indexOf'": indexOf$prime, 
    lastIndexOf: lastIndexOf, 
    "lastIndexOf'": lastIndexOf$prime, 
    localeCompare: localeCompare, 
    "null": $$null, 
    splitAt: splitAt, 
    stripPrefix: stripPrefix, 
    stripSuffix: stripSuffix, 
    takeWhile: takeWhile, 
    toChar: toChar, 
    uncons: uncons, 
    eqPattern: eqPattern, 
    ordPattern: ordPattern, 
    newtypePattern: newtypePattern, 
    showPattern: showPattern, 
    eqReplacement: eqReplacement, 
    ordReplacement: ordReplacement, 
    newtypeReplacement: newtypeReplacement, 
    showReplacement: showReplacement, 
    count: $foreign.count, 
    drop: $foreign.drop, 
    fromCharArray: $foreign.fromCharArray, 
    joinWith: $foreign.joinWith, 
    length: $foreign.length, 
    replace: $foreign.replace, 
    replaceAll: $foreign.replaceAll, 
    singleton: $foreign.singleton, 
    split: $foreign.split, 
    take: $foreign.take, 
    toCharArray: $foreign.toCharArray, 
    toLower: $foreign.toLower, 
    toUpper: $foreign.toUpper, 
    trim: $foreign.trim
};

},{"../Control.Semigroupoid":67,"../Data.Eq":92,"../Data.Function":102,"../Data.Maybe":122,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.String.Unsafe":147,"../Prelude":168,"./foreign":148}],150:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Generic = require("../Data.Generic");
var Data_Maybe = require("../Data.Maybe");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Seconds = function (x) {
    return x;
};
var Minutes = function (x) {
    return x;
};
var Milliseconds = function (x) {
    return x;
};
var Hours = function (x) {
    return x;
};
var Days = function (x) {
    return x;
};
var Duration = function (fromDuration, toDuration) {
    this.fromDuration = fromDuration;
    this.toDuration = toDuration;
};
var toDuration = function (dict) {
    return dict.toDuration;
};
var showSeconds = new Data_Show.Show(function (v) {
    return "(Seconds " + (Data_Show.show(Data_Show.showNumber)(v) + ")");
});
var showMinutes = new Data_Show.Show(function (v) {
    return "(Minutes " + (Data_Show.show(Data_Show.showNumber)(v) + ")");
});
var showMilliseconds = new Data_Show.Show(function (v) {
    return "(Milliseconds " + (Data_Show.show(Data_Show.showNumber)(v) + ")");
});
var showHours = new Data_Show.Show(function (v) {
    return "(Hours " + (Data_Show.show(Data_Show.showNumber)(v) + ")");
});
var showDays = new Data_Show.Show(function (v) {
    return "(Days " + (Data_Show.show(Data_Show.showNumber)(v) + ")");
});
var semiringSeconds = Data_Semiring.semiringNumber;
var semiringMinutes = Data_Semiring.semiringNumber;
var semiringMilliseconds = Data_Semiring.semiringNumber;
var semiringHours = Data_Semiring.semiringNumber;
var semiringDays = Data_Semiring.semiringNumber;
var ringSeconds = Data_Ring.ringNumber;
var ringMinutes = Data_Ring.ringNumber;
var ringMilliseconds = Data_Ring.ringNumber;
var ringHours = Data_Ring.ringNumber;
var ringDays = Data_Ring.ringNumber;
var ordSeconds = Data_Ord.ordNumber;
var ordMinutes = Data_Ord.ordNumber;
var ordMilliseconds = Data_Ord.ordNumber;
var ordHours = Data_Ord.ordNumber;
var ordDays = Data_Ord.ordNumber;
var newtypeSeconds = new Data_Newtype.Newtype(function (n) {
    return n;
}, Seconds);
var newtypeMinutes = new Data_Newtype.Newtype(function (n) {
    return n;
}, Minutes);
var newtypeMilliseconds = new Data_Newtype.Newtype(function (n) {
    return n;
}, Milliseconds);
var newtypeHours = new Data_Newtype.Newtype(function (n) {
    return n;
}, Hours);
var newtypeDays = new Data_Newtype.Newtype(function (n) {
    return n;
}, Days);
var genericSeconds = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Data.Time.Duration.Seconds" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Seconds))(Data_Generic.fromSpine(Data_Generic.genericNumber)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Data.Time.Duration.Seconds", [ {
        sigConstructor: "Data.Time.Duration.Seconds", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericNumber)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Data.Time.Duration.Seconds", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericNumber)(v);
    } ]);
});
var genericMinutes = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Data.Time.Duration.Minutes" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Minutes))(Data_Generic.fromSpine(Data_Generic.genericNumber)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Data.Time.Duration.Minutes", [ {
        sigConstructor: "Data.Time.Duration.Minutes", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericNumber)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Data.Time.Duration.Minutes", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericNumber)(v);
    } ]);
});
var genericMilliseconds = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Data.Time.Duration.Milliseconds" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Milliseconds))(Data_Generic.fromSpine(Data_Generic.genericNumber)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Data.Time.Duration.Milliseconds", [ {
        sigConstructor: "Data.Time.Duration.Milliseconds", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericNumber)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Data.Time.Duration.Milliseconds", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericNumber)(v);
    } ]);
});
var genericHours = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Data.Time.Duration.Hours" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Hours))(Data_Generic.fromSpine(Data_Generic.genericNumber)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Data.Time.Duration.Hours", [ {
        sigConstructor: "Data.Time.Duration.Hours", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericNumber)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Data.Time.Duration.Hours", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericNumber)(v);
    } ]);
});
var genericDays = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Data.Time.Duration.Days" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Days))(Data_Generic.fromSpine(Data_Generic.genericNumber)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Data.Time.Duration.Days", [ {
        sigConstructor: "Data.Time.Duration.Days", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericNumber)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Data.Time.Duration.Days", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericNumber)(v);
    } ]);
});
var fromDuration = function (dict) {
    return dict.fromDuration;
};
var eqSeconds = Data_Eq.eqNumber;
var eqMinutes = Data_Eq.eqNumber;
var eqMilliseconds = Data_Eq.eqNumber;
var eqHours = Data_Eq.eqNumber;
var eqDays = Data_Eq.eqNumber;
var durationSeconds = new Duration(Data_Newtype.over(newtypeSeconds)(newtypeMilliseconds)(Seconds)(function (v) {
    return v * 1000.0;
}), Data_Newtype.over(newtypeMilliseconds)(newtypeSeconds)(Milliseconds)(function (v) {
    return v / 1000.0;
}));
var durationMinutes = new Duration(Data_Newtype.over(newtypeMinutes)(newtypeMilliseconds)(Minutes)(function (v) {
    return v * 60000.0;
}), Data_Newtype.over(newtypeMilliseconds)(newtypeMinutes)(Milliseconds)(function (v) {
    return v / 60000.0;
}));
var durationMilliseconds = new Duration(Control_Category.id(Control_Category.categoryFn), Control_Category.id(Control_Category.categoryFn));
var durationHours = new Duration(Data_Newtype.over(newtypeHours)(newtypeMilliseconds)(Hours)(function (v) {
    return v * 3600000.0;
}), Data_Newtype.over(newtypeMilliseconds)(newtypeHours)(Milliseconds)(function (v) {
    return v / 3600000.0;
}));
var durationDays = new Duration(Data_Newtype.over(newtypeDays)(newtypeMilliseconds)(Days)(function (v) {
    return v * 8.64e7;
}), Data_Newtype.over(newtypeMilliseconds)(newtypeDays)(Milliseconds)(function (v) {
    return v / 8.64e7;
}));
var convertDuration = function (dictDuration) {
    return function (dictDuration1) {
        return function ($80) {
            return toDuration(dictDuration1)(fromDuration(dictDuration)($80));
        };
    };
};
module.exports = {
    Days: Days, 
    Hours: Hours, 
    Milliseconds: Milliseconds, 
    Minutes: Minutes, 
    Seconds: Seconds, 
    Duration: Duration, 
    convertDuration: convertDuration, 
    fromDuration: fromDuration, 
    toDuration: toDuration, 
    newtypeMilliseconds: newtypeMilliseconds, 
    genericMilliseconds: genericMilliseconds, 
    eqMilliseconds: eqMilliseconds, 
    ordMilliseconds: ordMilliseconds, 
    semiringMilliseconds: semiringMilliseconds, 
    ringMilliseconds: ringMilliseconds, 
    showMilliseconds: showMilliseconds, 
    newtypeSeconds: newtypeSeconds, 
    genericSeconds: genericSeconds, 
    eqSeconds: eqSeconds, 
    ordSeconds: ordSeconds, 
    semiringSeconds: semiringSeconds, 
    ringSeconds: ringSeconds, 
    showSeconds: showSeconds, 
    newtypeMinutes: newtypeMinutes, 
    genericMinutes: genericMinutes, 
    eqMinutes: eqMinutes, 
    ordMinutes: ordMinutes, 
    semiringMinutes: semiringMinutes, 
    ringMinutes: ringMinutes, 
    showMinutes: showMinutes, 
    newtypeHours: newtypeHours, 
    genericHours: genericHours, 
    eqHours: eqHours, 
    ordHours: ordHours, 
    semiringHours: semiringHours, 
    ringHours: ringHours, 
    showHours: showHours, 
    newtypeDays: newtypeDays, 
    genericDays: genericDays, 
    eqDays: eqDays, 
    ordDays: ordDays, 
    semiringDays: semiringDays, 
    ringDays: ringDays, 
    showDays: showDays, 
    durationMilliseconds: durationMilliseconds, 
    durationSeconds: durationSeconds, 
    durationMinutes: durationMinutes, 
    durationHours: durationHours, 
    durationDays: durationDays
};

},{"../Control.Apply":16,"../Control.Category":21,"../Control.Semigroupoid":67,"../Data.Eq":92,"../Data.EuclideanRing":94,"../Data.Generic":109,"../Data.Maybe":122,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.Unit":157,"../Prelude":168}],151:[function(require,module,exports){
"use strict";

// jshint maxparams: 3

exports.traverseArrayImpl = function () {
  function Cont(fn) {
    this.fn = fn;
  }

  var emptyList = {};

  var ConsCell = function (head, tail) {
    this.head = head;
    this.tail = tail;
  };

  function consList(x) {
    return function (xs) {
      return new ConsCell(x, xs);
    };
  }

  function listToArray(list) {
    var arr = [];
    var xs = list;
    while (xs !== emptyList) {
      arr.push(xs.head);
      xs = xs.tail;
    }
    return arr;
  }

  return function (apply) {
    return function (map) {
      return function (pure) {
        return function (f) {
          var buildFrom = function (x, ys) {
            return apply(map(consList)(f(x)))(ys);
          };

          var go = function (acc, currentLen, xs) {
            if (currentLen === 0) {
              return acc;
            } else {
              var last = xs[currentLen - 1];
              return new Cont(function () {
                return go(buildFrom(last, acc), currentLen - 1, xs);
              });
            }
          };

          return function (array) {
            var result = go(pure(emptyList), array.length, array);
            while (result instanceof Cont) {
              result = result.fn();
            }

            return map(listToArray)(result);
          };
        };
      };
    };
  };
}();

},{}],152:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var Prelude = require("../Prelude");
var StateL = function (x) {
    return x;
};
var StateR = function (x) {
    return x;
};
var Traversable = function (Foldable1, Functor0, sequence, traverse) {
    this.Foldable1 = Foldable1;
    this.Functor0 = Functor0;
    this.sequence = sequence;
    this.traverse = traverse;
};
var traverse = function (dict) {
    return dict.traverse;
};
var traversableMultiplicative = new Traversable(function () {
    return Data_Foldable.foldableMultiplicative;
}, function () {
    return Data_Monoid_Multiplicative.functorMultiplicative;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Multiplicative.Multiplicative)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Multiplicative.Multiplicative)(f(v));
        };
    };
});
var traversableMaybe = new Traversable(function () {
    return Data_Foldable.foldableMaybe;
}, function () {
    return Data_Maybe.functorMaybe;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Data_Maybe.Nothing) {
            return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
        };
        if (v instanceof Data_Maybe.Just) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe.Just.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Traversable line 87, column 3 - line 87, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
            };
            if (v1 instanceof Data_Maybe.Just) {
                return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe.Just.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Traversable line 85, column 3 - line 85, column 37: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableDual = new Traversable(function () {
    return Data_Foldable.foldableDual;
}, function () {
    return Data_Monoid_Dual.functorDual;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Dual.Dual)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Dual.Dual)(f(v));
        };
    };
});
var traversableDisj = new Traversable(function () {
    return Data_Foldable.foldableDisj;
}, function () {
    return Data_Monoid_Disj.functorDisj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Disj.Disj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Disj.Disj)(f(v));
        };
    };
});
var traversableConj = new Traversable(function () {
    return Data_Foldable.foldableConj;
}, function () {
    return Data_Monoid_Conj.functorConj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Conj.Conj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Conj.Conj)(f(v));
        };
    };
});
var traversableAdditive = new Traversable(function () {
    return Data_Foldable.foldableAdditive;
}, function () {
    return Data_Monoid_Additive.functorAdditive;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Additive.Additive)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Monoid_Additive.Additive)(f(v));
        };
    };
});
var stateR = function (v) {
    return v;
};
var stateL = function (v) {
    return v;
};
var sequenceDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return traverse(dictTraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn));
    };
};
var traversableArray = new Traversable(function () {
    return Data_Foldable.foldableArray;
}, function () {
    return Data_Functor.functorArray;
}, function (dictApplicative) {
    return sequenceDefault(traversableArray)(dictApplicative);
}, function (dictApplicative) {
    return $foreign.traverseArrayImpl(Control_Apply.apply(dictApplicative.Apply0()))(Data_Functor.map((dictApplicative.Apply0()).Functor0()))(Control_Applicative.pure(dictApplicative));
});
var sequence = function (dict) {
    return dict.sequence;
};
var traversableFirst = new Traversable(function () {
    return Data_Foldable.foldableFirst;
}, function () {
    return Data_Maybe_First.functorFirst;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe_First.First)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe_First.First)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traversableLast = new Traversable(function () {
    return Data_Foldable.foldableLast;
}, function () {
    return Data_Maybe_Last.functorLast;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe_Last.Last)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Data_Maybe_Last.Last)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traverseDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (ta) {
                return sequence(dictTraversable)(dictApplicative)(Data_Functor.map(dictTraversable.Functor0())(f)(ta));
            };
        };
    };
};
var functorStateR = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var v = stateR(k)(s);
            return {
                accum: v.accum, 
                value: f(v.value)
            };
        };
    };
});
var functorStateL = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var v = stateL(k)(s);
            return {
                accum: v.accum, 
                value: f(v.value)
            };
        };
    };
});
var $$for = function (dictApplicative) {
    return function (dictTraversable) {
        return function (x) {
            return function (f) {
                return traverse(dictTraversable)(dictApplicative)(f)(x);
            };
        };
    };
};
var applyStateR = new Control_Apply.Apply(function () {
    return functorStateR;
}, function (f) {
    return function (x) {
        return function (s) {
            var v = stateR(x)(s);
            var v1 = stateR(f)(v.accum);
            return {
                accum: v1.accum, 
                value: v1.value(v.value)
            };
        };
    };
});
var applyStateL = new Control_Apply.Apply(function () {
    return functorStateL;
}, function (f) {
    return function (x) {
        return function (s) {
            var v = stateL(f)(s);
            var v1 = stateL(x)(v.accum);
            return {
                accum: v1.accum, 
                value: v.value(v1.value)
            };
        };
    };
});
var applicativeStateR = new Control_Applicative.Applicative(function () {
    return applyStateR;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumR = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateR(traverse(dictTraversable)(applicativeStateR)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanr = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumR(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(a)(b);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
var applicativeStateL = new Control_Applicative.Applicative(function () {
    return applyStateL;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumL = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateL(traverse(dictTraversable)(applicativeStateL)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanl = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumL(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(b)(a);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
module.exports = {
    Traversable: Traversable, 
    "for": $$for, 
    mapAccumL: mapAccumL, 
    mapAccumR: mapAccumR, 
    scanl: scanl, 
    scanr: scanr, 
    sequence: sequence, 
    sequenceDefault: sequenceDefault, 
    traverse: traverse, 
    traverseDefault: traverseDefault, 
    traversableArray: traversableArray, 
    traversableMaybe: traversableMaybe, 
    traversableFirst: traversableFirst, 
    traversableLast: traversableLast, 
    traversableAdditive: traversableAdditive, 
    traversableDual: traversableDual, 
    traversableConj: traversableConj, 
    traversableDisj: traversableDisj, 
    traversableMultiplicative: traversableMultiplicative
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Data.Foldable":97,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Maybe.First":120,"../Data.Maybe.Last":121,"../Data.Monoid.Additive":123,"../Data.Monoid.Conj":124,"../Data.Monoid.Disj":125,"../Data.Monoid.Dual":126,"../Data.Monoid.Multiplicative":128,"../Prelude":168,"./foreign":151}],153:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Monoid = require("../Data.Monoid");
var Data_Newtype = require("../Data.Newtype");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Tuple = (function () {
    function Tuple(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Tuple.create = function (value0) {
        return function (value1) {
            return new Tuple(value0, value1);
        };
    };
    return Tuple;
})();
var uncurry = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var swap = function (v) {
    return new Tuple(v.value1, v.value0);
};
var snd = function (v) {
    return v.value1;
};
var showTuple = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(Tuple " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var semiringTuple = function (dictSemiring) {
    return function (dictSemiring1) {
        return new Data_Semiring.Semiring(function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.add(dictSemiring)(v.value0)(v1.value0), Data_Semiring.add(dictSemiring1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.mul(dictSemiring)(v.value0)(v1.value0), Data_Semiring.mul(dictSemiring1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_Semiring.one(dictSemiring), Data_Semiring.one(dictSemiring1)), new Tuple(Data_Semiring.zero(dictSemiring), Data_Semiring.zero(dictSemiring1)));
    };
};
var semigroupoidTuple = new Control_Semigroupoid.Semigroupoid(function (v) {
    return function (v1) {
        return new Tuple(v1.value0, v.value1);
    };
});
var semigroupTuple = function (dictSemigroup) {
    return function (dictSemigroup1) {
        return new Data_Semigroup.Semigroup(function (v) {
            return function (v1) {
                return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), Data_Semigroup.append(dictSemigroup1)(v.value1)(v1.value1));
            };
        });
    };
};
var ringTuple = function (dictRing) {
    return function (dictRing1) {
        return new Data_Ring.Ring(function () {
            return semiringTuple(dictRing.Semiring0())(dictRing1.Semiring0());
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Ring.sub(dictRing)(v.value0)(v1.value0), Data_Ring.sub(dictRing1)(v.value1)(v1.value1));
            };
        });
    };
};
var monoidTuple = function (dictMonoid) {
    return function (dictMonoid1) {
        return new Data_Monoid.Monoid(function () {
            return semigroupTuple(dictMonoid.Semigroup0())(dictMonoid1.Semigroup0());
        }, new Tuple(Data_Monoid.mempty(dictMonoid), Data_Monoid.mempty(dictMonoid1)));
    };
};
var lookup = function (dictFoldable) {
    return function (dictEq) {
        return function (a) {
            return function ($260) {
                return Data_Newtype.unwrap(Data_Maybe_First.newtypeFirst)(Data_Foldable.foldMap(dictFoldable)(Data_Maybe_First.monoidFirst)(function (v) {
                    var $140 = Data_Eq.eq(dictEq)(a)(v.value0);
                    if ($140) {
                        return new Data_Maybe.Just(v.value1);
                    };
                    return Data_Maybe.Nothing.value;
                })($260));
            };
        };
    };
};
var heytingAlgebraTuple = function (dictHeytingAlgebra) {
    return function (dictHeytingAlgebra1) {
        return new Data_HeytingAlgebra.HeytingAlgebra(function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.conj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.disj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra1)), function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.implies(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.implies(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return new Tuple(Data_HeytingAlgebra.not(dictHeytingAlgebra)(v.value0), Data_HeytingAlgebra.not(dictHeytingAlgebra1)(v.value1));
        }, new Tuple(Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra1)));
    };
};
var functorTuple = new Data_Functor.Functor(function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v.value1));
    };
});
var invariantTuple = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorTuple));
var fst = function (v) {
    return v.value0;
};
var lazyTuple = function (dictLazy) {
    return function (dictLazy1) {
        return new Control_Lazy.Lazy(function (f) {
            return new Tuple(Control_Lazy.defer(dictLazy)(function (v) {
                return fst(f(Data_Unit.unit));
            }), Control_Lazy.defer(dictLazy1)(function (v) {
                return snd(f(Data_Unit.unit));
            }));
        });
    };
};
var foldableTuple = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v.value1)(z);
        };
    };
});
var traversableTuple = new Data_Traversable.Traversable(function () {
    return foldableTuple;
}, function () {
    return functorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Tuple.create(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative.Apply0()).Functor0())(Tuple.create(v.value0))(f(v.value1));
        };
    };
});
var extendTuple = new Control_Extend.Extend(function () {
    return functorTuple;
}, function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v));
    };
});
var eqTuple = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (x) {
            return function (y) {
                return Data_Eq.eq(dictEq)(x.value0)(y.value0) && Data_Eq.eq(dictEq1)(x.value1)(y.value1);
            };
        });
    };
};
var ordTuple = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqTuple(dictOrd.Eq0())(dictOrd1.Eq0());
        }, function (x) {
            return function (y) {
                var $206 = Data_Ord.compare(dictOrd)(x.value0)(y.value0);
                if ($206 instanceof Data_Ordering.LT) {
                    return Data_Ordering.LT.value;
                };
                if ($206 instanceof Data_Ordering.GT) {
                    return Data_Ordering.GT.value;
                };
                return Data_Ord.compare(dictOrd1)(x.value1)(y.value1);
            };
        });
    };
};
var eq1Tuple = function (dictEq) {
    return new Data_Eq.Eq1(function (dictEq1) {
        return Data_Eq.eq(eqTuple(dictEq)(dictEq1));
    });
};
var ord1Tuple = function (dictOrd) {
    return new Data_Ord.Ord1(function () {
        return eq1Tuple(dictOrd.Eq0());
    }, function (dictOrd1) {
        return Data_Ord.compare(ordTuple(dictOrd)(dictOrd1));
    });
};
var curry = function (f) {
    return function (a) {
        return function (b) {
            return f(new Tuple(a, b));
        };
    };
};
var comonadTuple = new Control_Comonad.Comonad(function () {
    return extendTuple;
}, snd);
var commutativeRingTuple = function (dictCommutativeRing) {
    return function (dictCommutativeRing1) {
        return new Data_CommutativeRing.CommutativeRing(function () {
            return ringTuple(dictCommutativeRing.Ring0())(dictCommutativeRing1.Ring0());
        });
    };
};
var boundedTuple = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordTuple(dictBounded.Ord0())(dictBounded1.Ord0());
        }, new Tuple(Data_Bounded.bottom(dictBounded), Data_Bounded.bottom(dictBounded1)), new Tuple(Data_Bounded.top(dictBounded), Data_Bounded.top(dictBounded1)));
    };
};
var booleanAlgebraTuple = function (dictBooleanAlgebra) {
    return function (dictBooleanAlgebra1) {
        return new Data_BooleanAlgebra.BooleanAlgebra(function () {
            return heytingAlgebraTuple(dictBooleanAlgebra.HeytingAlgebra0())(dictBooleanAlgebra1.HeytingAlgebra0());
        });
    };
};
var bifunctorTuple = new Data_Bifunctor.Bifunctor(function (f) {
    return function (g) {
        return function (v) {
            return new Tuple(f(v.value0), g(v.value1));
        };
    };
});
var bifoldableTuple = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Data_Semigroup.append(dictMonoid.Semigroup0())(f(v.value0))(g(v.value1));
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return g(f(z)(v.value0))(v.value1);
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return f(v.value0)(g(v.value1)(z));
            };
        };
    };
});
var bitraversableTuple = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableTuple;
}, function () {
    return bifunctorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(Tuple.create)(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Control_Apply.apply(dictApplicative.Apply0())(Data_Functor.map((dictApplicative.Apply0()).Functor0())(Tuple.create)(f(v.value0)))(g(v.value1));
            };
        };
    };
});
var biapplyTuple = new Control_Biapply.Biapply(function () {
    return bifunctorTuple;
}, function (v) {
    return function (v1) {
        return new Tuple(v.value0(v1.value0), v.value1(v1.value1));
    };
});
var biapplicativeTuple = new Control_Biapplicative.Biapplicative(function () {
    return biapplyTuple;
}, Tuple.create);
var applyTuple = function (dictSemigroup) {
    return new Control_Apply.Apply(function () {
        return functorTuple;
    }, function (v) {
        return function (v1) {
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), v.value1(v1.value1));
        };
    });
};
var bindTuple = function (dictSemigroup) {
    return new Control_Bind.Bind(function () {
        return applyTuple(dictSemigroup);
    }, function (v) {
        return function (f) {
            var v1 = f(v.value1);
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), v1.value1);
        };
    });
};
var applicativeTuple = function (dictMonoid) {
    return new Control_Applicative.Applicative(function () {
        return applyTuple(dictMonoid.Semigroup0());
    }, Tuple.create(Data_Monoid.mempty(dictMonoid)));
};
var monadTuple = function (dictMonoid) {
    return new Control_Monad.Monad(function () {
        return applicativeTuple(dictMonoid);
    }, function () {
        return bindTuple(dictMonoid.Semigroup0());
    });
};
module.exports = {
    Tuple: Tuple, 
    curry: curry, 
    fst: fst, 
    lookup: lookup, 
    snd: snd, 
    swap: swap, 
    uncurry: uncurry, 
    showTuple: showTuple, 
    eqTuple: eqTuple, 
    eq1Tuple: eq1Tuple, 
    ordTuple: ordTuple, 
    ord1Tuple: ord1Tuple, 
    boundedTuple: boundedTuple, 
    semigroupoidTuple: semigroupoidTuple, 
    semigroupTuple: semigroupTuple, 
    monoidTuple: monoidTuple, 
    semiringTuple: semiringTuple, 
    ringTuple: ringTuple, 
    commutativeRingTuple: commutativeRingTuple, 
    heytingAlgebraTuple: heytingAlgebraTuple, 
    booleanAlgebraTuple: booleanAlgebraTuple, 
    functorTuple: functorTuple, 
    invariantTuple: invariantTuple, 
    bifunctorTuple: bifunctorTuple, 
    applyTuple: applyTuple, 
    biapplyTuple: biapplyTuple, 
    applicativeTuple: applicativeTuple, 
    biapplicativeTuple: biapplicativeTuple, 
    bindTuple: bindTuple, 
    monadTuple: monadTuple, 
    extendTuple: extendTuple, 
    comonadTuple: comonadTuple, 
    lazyTuple: lazyTuple, 
    foldableTuple: foldableTuple, 
    bifoldableTuple: bifoldableTuple, 
    traversableTuple: traversableTuple, 
    bitraversableTuple: bitraversableTuple
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Biapplicative":17,"../Control.Biapply":18,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Lazy":26,"../Control.Monad":61,"../Control.Semigroupoid":67,"../Data.Bifoldable":76,"../Data.Bifunctor":82,"../Data.Bitraversable":83,"../Data.BooleanAlgebra":85,"../Data.Bounded":87,"../Data.CommutativeRing":88,"../Data.Eq":92,"../Data.Foldable":97,"../Data.Function":102,"../Data.Functor":107,"../Data.Functor.Invariant":105,"../Data.HeytingAlgebra":111,"../Data.Maybe":122,"../Data.Maybe.First":120,"../Data.Monoid":129,"../Data.Newtype":131,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.Traversable":152,"../Data.Unit":157,"../Prelude":168}],154:[function(require,module,exports){
"use strict";

exports.unfoldrArrayImpl = function (isNothing) {
  return function (fromJust) {
    return function (fst) {
      return function (snd) {
        return function (f) {
          return function (b) {
            var result = [];
            var value = b;
            while (true) { // eslint-disable-line no-constant-condition
              var maybe = f(value);
              if (isNothing(maybe)) return result;
              var tuple = fromJust(maybe);
              result.push(fst(tuple));
              value = snd(tuple);
            }
          };
        };
      };
    };
  };
};

},{}],155:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var Partial_Unsafe = require("../Partial.Unsafe");
var Prelude = require("../Prelude");
var Unfoldable = function (unfoldr) {
    this.unfoldr = unfoldr;
};
var unfoldr = function (dict) {
    return dict.unfoldr;
};
var unfoldableArray = new Unfoldable($foreign.unfoldrArrayImpl(Data_Maybe.isNothing)(Data_Maybe.fromJust())(Data_Tuple.fst)(Data_Tuple.snd));
var replicate = function (dictUnfoldable) {
    return function (n) {
        return function (v) {
            var step = function (i) {
                var $8 = i <= 0;
                if ($8) {
                    return Data_Maybe.Nothing.value;
                };
                return new Data_Maybe.Just(new Data_Tuple.Tuple(v, i - 1 | 0));
            };
            return unfoldr(dictUnfoldable)(step)(n);
        };
    };
};
var replicateA = function (dictApplicative) {
    return function (dictUnfoldable) {
        return function (dictTraversable) {
            return function (n) {
                return function (m) {
                    return Data_Traversable.sequence(dictTraversable)(dictApplicative)(replicate(dictUnfoldable)(n)(m));
                };
            };
        };
    };
};
var singleton = function (dictUnfoldable) {
    return replicate(dictUnfoldable)(1);
};
var none = function (dictUnfoldable) {
    return unfoldr(dictUnfoldable)(Data_Function["const"](Data_Maybe.Nothing.value))(Data_Unit.unit);
};
var fromMaybe = function (dictUnfoldable) {
    return unfoldr(dictUnfoldable)(function (b) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(Data_Function.flip(Data_Tuple.Tuple.create)(Data_Maybe.Nothing.value))(b);
    });
};
module.exports = {
    Unfoldable: Unfoldable, 
    fromMaybe: fromMaybe, 
    none: none, 
    replicate: replicate, 
    replicateA: replicateA, 
    singleton: singleton, 
    unfoldr: unfoldr, 
    unfoldableArray: unfoldableArray
};

},{"../Data.Function":102,"../Data.Functor":107,"../Data.Maybe":122,"../Data.Ord":136,"../Data.Ring":139,"../Data.Traversable":152,"../Data.Tuple":153,"../Data.Unit":157,"../Partial.Unsafe":165,"../Prelude":168,"./foreign":154}],156:[function(require,module,exports){
"use strict";

exports.unit = {};

},{}],157:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Data_Show = require("../Data.Show");
var showUnit = new Data_Show.Show(function (v) {
    return "unit";
});
module.exports = {
    showUnit: showUnit, 
    unit: $foreign.unit
};

},{"../Data.Show":145,"./foreign":156}],158:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Data_Show = require("../Data.Show");
var Void = function (x) {
    return x;
};
var absurd = function (a) {
    var spin = function (__copy_v) {
        var v = __copy_v;
        var __tco_result;
        var __tco_v;
        function __tco_loop(v) {
            __tco_v = v;
            return;
        };
        while (!false) {
            __tco_result = __tco_loop(v);
            v = __tco_v;
        };
        return __tco_result;
    };
    return spin(a);
};
var showVoid = new Data_Show.Show(absurd);
module.exports = {
    absurd: absurd, 
    showVoid: showVoid
};

},{"../Data.Show":145}],159:[function(require,module,exports){
/* globals exports */
"use strict";

// module Global

exports.nan = NaN;

exports.isNaN = isNaN;

exports.infinity = Infinity;

exports.isFinite = isFinite;

exports.readInt = function (radix) {
  return function (n) {
    return parseInt(n, radix);
  };
};

exports.readFloat = parseFloat;

exports.decodeURI = decodeURI;
exports.encodeURI = encodeURI;
exports.decodeURIComponent = decodeURIComponent;
exports.encodeURIComponent = encodeURIComponent;

},{}],160:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
module.exports = {
    "decodeURI": $foreign["decodeURI"], 
    "decodeURIComponent": $foreign["decodeURIComponent"], 
    "encodeURI": $foreign["encodeURI"], 
    "encodeURIComponent": $foreign["encodeURIComponent"], 
    infinity: $foreign.infinity, 
    "isFinite": $foreign["isFinite"], 
    "isNaN": $foreign["isNaN"], 
    nan: $foreign.nan, 
    readFloat: $foreign.readFloat, 
    readInt: $foreign.readInt
};

},{"./foreign":159}],161:[function(require,module,exports){
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Cycle = require("../Control.Cycle");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Console = require("../Control.Monad.Eff.Console");
var Control_Monad_Eff_JQuery = require("../Control.Monad.Eff.JQuery");
var Control_Monad_Eff_Timer = require("../Control.Monad.Eff.Timer");
var Control_XStream = require("../Control.XStream");
var DOM = require("../DOM");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Generic = require("../Data.Generic");
var Data_Maybe = require("../Data.Maybe");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Prelude = require("../Prelude");
var Timer = (function () {
    function Timer(value0) {
        this.value0 = value0;
    };
    Timer.create = function (value0) {
        return new Timer(value0);
    };
    return Timer;
})();
var Display = (function () {
    function Display(value0) {
        this.value0 = value0;
    };
    Display.create = function (value0) {
        return new Display(value0);
    };
    return Display;
})();
var main_ = function (queries) {
    var inner = function (v) {
        return new Display(Data_Show.show(Data_Show.showInt)(v.value0));
    };
    return Data_Functor.map(Control_XStream.functorStream)(inner)(queries);
};
var genericCommand = new Data_Generic.Generic(function (v) {
    if (v instanceof Data_Generic.SProd && (v.value0 === "Main.Display" && v.value1.length === 1)) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(new Data_Maybe.Just(Display.create))(Data_Generic.fromSpine(Data_Generic.genericString)(v["value1"][0](Data_Unit.unit)));
    };
    return Data_Maybe.Nothing.value;
}, function ($dollarq) {
    return new Data_Generic.SigProd("Main.Command", [ {
        sigConstructor: "Main.Display", 
        sigValues: [ function ($dollarq1) {
            return Data_Generic.toSignature(Data_Generic.genericString)(Data_Generic.anyProxy);
        } ]
    } ]);
}, function (v) {
    return new Data_Generic.SProd("Main.Display", [ function ($dollarq) {
        return Data_Generic.toSpine(Data_Generic.genericString)(v.value0);
    } ]);
});
var showCommand = new Data_Show.Show(Data_Generic.gShow(genericCommand));
var driver = function (commands) {
    var logCommands = Control_XStream.addListener(Control_XStream.defaultListener)(commands);
    var display = Control_Monad_Eff_JQuery.ready(function __do() {
        var v = Control_Monad_Eff_JQuery.body();
        var v1 = Control_Monad_Eff_JQuery.create("<div>")();
        var v2 = Control_Monad_Eff_JQuery.create("<h1>Periodic:</h1>")();
        var v3 = Control_Monad_Eff_JQuery.create("<h2>")();
        Control_Monad_Eff_JQuery.append(v2)(v1)();
        Control_Monad_Eff_JQuery.append(v3)(v1)();
        Control_Monad_Eff_JQuery.append(v1)(v)();
        return Control_XStream.addListener((function () {
            var $24 = {};
            for (var $25 in Control_XStream.defaultListener) {
                if ({}.hasOwnProperty.call(Control_XStream.defaultListener, $25)) {
                    $24[$25] = Control_XStream["defaultListener"][$25];
                };
            };
            $24.next = function (x) {
                return Control_Monad_Eff_JQuery.setText(x)(v3);
            };
            return $24;
        })())(Control_Bind.bind(Control_XStream.bindStream)(commands)(function (v4) {
            return Control_Applicative.pure(Control_XStream.applicativeStream)(v4.value0);
        }))();
    });
    return function __do() {
        logCommands();
        display();
        var v = Data_Functor.map(Control_Monad_Eff.functorEff)(Control_XStream.startWith(0))(Control_XStream.periodic(1000))();
        return Data_Functor.map(Control_XStream.functorStream)(Timer.create)(v);
    };
};
var main = Data_Functor["void"](Control_Monad_Eff.functorEff)(Control_Cycle.run(main_)(driver));
module.exports = {
    Display: Display, 
    Timer: Timer, 
    driver: driver, 
    main: main, 
    main_: main_, 
    genericCommand: genericCommand, 
    showCommand: showCommand
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Cycle":24,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Console":35,"../Control.Monad.Eff.JQuery":39,"../Control.Monad.Eff.Timer":43,"../Control.XStream":69,"../DOM":70,"../Data.Function":102,"../Data.Functor":107,"../Data.Generic":109,"../Data.Maybe":122,"../Data.Show":145,"../Data.Unit":157,"../Prelude":168}],162:[function(require,module,exports){
"use strict";

// module Math

exports.abs = Math.abs;

exports.acos = Math.acos;

exports.asin = Math.asin;

exports.atan = Math.atan;

exports.atan2 = function (y) {
  return function (x) {
    return Math.atan2(y, x);
  };
};

exports.ceil = Math.ceil;

exports.cos = Math.cos;

exports.exp = Math.exp;

exports.floor = Math.floor;

exports.trunc = Math.trunc || function (n) {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
};

exports.log = Math.log;

exports.max = function (n1) {
  return function (n2) {
    return Math.max(n1, n2);
  };
};

exports.min = function (n1) {
  return function (n2) {
    return Math.min(n1, n2);
  };
};

exports.pow = function (n) {
  return function (p) {
    return Math.pow(n, p);
  };
};

exports.remainder = function (n) {
  return function (m) {
    return n % m;
  };
};

exports.round = Math.round;

exports.sin = Math.sin;

exports.sqrt = Math.sqrt;

exports.tan = Math.tan;

exports.e = Math.E;

exports.ln2 = Math.LN2;

exports.ln10 = Math.LN10;

exports.log2e = Math.LOG2E;

exports.log10e = Math.LOG10E;

exports.pi = Math.PI;

exports.sqrt1_2 = Math.SQRT1_2;

exports.sqrt2 = Math.SQRT2;

},{}],163:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
module.exports = {
    abs: $foreign.abs, 
    acos: $foreign.acos, 
    asin: $foreign.asin, 
    atan: $foreign.atan, 
    atan2: $foreign.atan2, 
    ceil: $foreign.ceil, 
    cos: $foreign.cos, 
    e: $foreign.e, 
    exp: $foreign.exp, 
    floor: $foreign.floor, 
    ln10: $foreign.ln10, 
    ln2: $foreign.ln2, 
    log: $foreign.log, 
    log10e: $foreign.log10e, 
    log2e: $foreign.log2e, 
    max: $foreign.max, 
    min: $foreign.min, 
    pi: $foreign.pi, 
    pow: $foreign.pow, 
    remainder: $foreign.remainder, 
    round: $foreign.round, 
    sin: $foreign.sin, 
    sqrt: $foreign.sqrt, 
    sqrt1_2: $foreign.sqrt1_2, 
    sqrt2: $foreign.sqrt2, 
    tan: $foreign.tan, 
    trunc: $foreign.trunc
};

},{"./foreign":162}],164:[function(require,module,exports){
"use strict";

// module Partial.Unsafe

exports.unsafePartial = function (f) {
  return f();
};

exports.unsafePartialBecause = function (reason) {
  return function (f) {
    try {
      return exports.unsafePartial(f);
    } catch (err) {
      throw new Error("unsafePartial failed. The following " +
                      "assumption was incorrect: '" + reason + "'.");
    }
  };
};

},{}],165:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var Partial = require("../Partial");
var unsafeCrashWith = function (msg) {
    return $foreign.unsafePartial(function (dictPartial) {
        return Partial.crashWith(dictPartial)(msg);
    });
};
module.exports = {
    unsafeCrashWith: unsafeCrashWith, 
    unsafePartial: $foreign.unsafePartial, 
    unsafePartialBecause: $foreign.unsafePartialBecause
};

},{"../Partial":167,"./foreign":164}],166:[function(require,module,exports){
"use strict";

// module Partial

exports.crashWith = function () {
  return function (msg) {
    throw new Error(msg);
  };
};

},{}],167:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
var crash = function (dictPartial) {
    return $foreign.crashWith(dictPartial)("Partial.crash: partial function");
};
module.exports = {
    crash: crash, 
    crashWith: $foreign.crashWith
};

},{"./foreign":166}],168:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Boolean = require("../Data.Boolean");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Field = require("../Data.Field");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_NaturalTransformation = require("../Data.NaturalTransformation");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
module.exports = {};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Semigroupoid":67,"../Data.Boolean":84,"../Data.BooleanAlgebra":85,"../Data.Bounded":87,"../Data.CommutativeRing":88,"../Data.Eq":92,"../Data.EuclideanRing":94,"../Data.Field":95,"../Data.Function":102,"../Data.Functor":107,"../Data.HeytingAlgebra":111,"../Data.NaturalTransformation":130,"../Data.Ord":136,"../Data.Ordering":137,"../Data.Ring":139,"../Data.Semigroup":141,"../Data.Semiring":143,"../Data.Show":145,"../Data.Unit":157,"../Data.Void":158}],169:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var Proxy3 = (function () {
    function Proxy3() {

    };
    Proxy3.value = new Proxy3();
    return Proxy3;
})();
var Proxy2 = (function () {
    function Proxy2() {

    };
    Proxy2.value = new Proxy2();
    return Proxy2;
})();
var $$Proxy = (function () {
    function $$Proxy() {

    };
    $$Proxy.value = new $$Proxy();
    return $$Proxy;
})();
module.exports = {
    "Proxy": $$Proxy, 
    Proxy2: Proxy2, 
    Proxy3: Proxy3
};

},{}],170:[function(require,module,exports){
"use strict";

// module Unsafe.Coerce

exports.unsafeCoerce = function (x) {
  return x;
};

},{}],171:[function(require,module,exports){
// Generated by purs version 0.11.1
"use strict";
var $foreign = require("./foreign");
module.exports = {
    unsafeCoerce: $foreign.unsafeCoerce
};

},{"./foreign":170}],172:[function(require,module,exports){
require('Main').main();

},{"Main":161}]},{},[172]);