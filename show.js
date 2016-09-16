// Add job data from javascript_advert.js to HTML.
function addHtml() {
  var data = window.job;
  var enums = {}; // enum value -> enum info
  Object.keys(window).forEach(function(k) {
    var v = window[k];
    if (typeof(v) != "function" || v.length != 0 ||
        !v.toString().match(/return\s+enumerate/))
      return;
    var info = {name: k, values: v().all};
    info.values.forEach(function(value) { enums[value] = info });
  });

  // Note: Using jQuery here for brevity constructing DOM nodes. Only the
  // addHtml functions use jQuery, the rest of this script is plain js.
  var body = $(document.body);
  var container = $("<div>").addClass("container").appendTo(body);
  var shadow = $("<div>").addClass("shadow").appendTo(body);
  var innerEllipse = $("<div>").addClass("innerEllipse").appendTo(container);
  var outerEllipse = $("<div>").addClass("outerEllipse").appendTo(container);

  var rows = [];
  addHtmlData(null, data, enums, container, rows);

  // Dance, monkey!
  new Animation(container[0], shadow[0], innerEllipse[0], outerEllipse[0],
                rows);
}

// Add (key, value) data to parent HTML element where value can be a primitive
// value, an array, or a JSON object.
function addHtmlData(key, value, enums, parent, rows, depth, section) {
  if (typeof value != "object") {
    addHtmlValues(key, [ value ], enums, parent, rows, depth, section);
  } else if (Array.isArray(value)) {
    addHtmlValues(key, value, enums, parent, rows, depth, section);
  } else {
    if (key)
      addHtmlValues(key, [], enums, parent, rows, depth, section);
    Object.keys(value).forEach(function(k) {
      var v = value[k];
      if (depth) {
        addHtmlData(k, v, enums, parent, rows, depth + 1, section);
      } else {
        var newParent = $("<div>")
                            .addClass("section")
                            .append($("<div>").addClass("separator"))
                            .appendTo(parent);
        var newSection = new Section(newParent[0]);
        addHtmlValues(k, [], enums, newParent, rows, 1, newSection);
        addHtmlData(null, v, enums, newParent, rows, 1, newSection);
      }
    });
  }
};

// Add (key, values) data to parent HTML element where values is an array of
// strings.
function addHtmlValues(key, values, enums, parent, rows, depth, section) {
  var row = $("<div>").addClass("row").appendTo(parent);
  var rowtext = $("<div>").addClass("rowtext").appendTo(row);
  if (key)
    $("<div>")
        .addClass("key")
        .addClass("d" + depth)
        .append(key)
        .appendTo(rowtext);
  if (values.length > 0) {
    var valueSet = {}; // value name -> true
    values.forEach(function(value) { valueSet[value] = true; });
    var enumValues = [];     // list of enum values to display
    var enumNames = {};      // enum name -> true
    var enumDisplay = false; // whether to display values as enums
    values.forEach(function(value) {
      var enumInfo = enums[value];
      if (!enumInfo) {
        enumValues.push({value : value});
      } else if (!enumNames[enumInfo.name]) {
        enumNames[enumInfo.name] = true;
        enumInfo.values.forEach(function(otherValue) {
          enumValues.push({
            value : otherValue,
            disabled : valueSet[otherValue] === undefined
          });
        });
        enumDisplay = true;
      }
    });
    var valuesElem = $("<div>").addClass("values").appendTo(rowtext);
    if (enumDisplay) {
      enumValues.forEach(function(enumValue) {
        var value = $("<div>")
                        .addClass("value")
                        .append(enumValue.value)
                        .appendTo(valuesElem);
        value.addClass(enumValue.disabled ? "disabled" : "enabled");
      });
    } else {
      $("<div>")
          .addClass("value")
          .append(values.map(function(value) {
              return typeof(value) !== "boolean" ? value :
                     value ? "Yes" : "No"; }).join(", "))
          .appendTo(valuesElem);
    }
  }

  rows.push(new Row(row[0], rowtext[0], section));
}

// Animation class responsible for opening transition when the page loads, and
// for scrolling page in response to mouse events.
function Animation(container, shadow, innerEllipse, outerEllipse, rows) {
  this.container = container; // Container div.
  this.shadow = shadow;       // Space filler when container set position:fixed.
  this.innerEllipse = innerEllipse; // Inner ellipse div.
  this.outerEllipse = outerEllipse; // Outer ellispse div.
  this.rows = rows;                 // Array of Row objects.
  this.animating = false; // Whether requestAnimationFrame call is pending.
  this.prevScroll = null; // Vertical scroll position at last frame (pixels).
  this.prevMouse = null;  // Vertical mouse position at last frame (pixels).
  this.prevTime = null;   // Timestamp at last frame (ms).
  this.startTime = null;  // Timestamp at first frame (ms).
  this.prevRow = null;    // Highlighted row object at last frame.
  this.curMouse = null;   // Current vertical mouse position (pixels).
  this.mouseTime = null;  // Timestamp mouse position last changed (ms).
  this.spring = new DampedSpring; // Scroll animation spring state.
  this.onframeCallback = this.onframe.bind(this); // Frame callback.
  this.cachedViewWidth = null;                    // Cached view width.
  this.cachedIndent = null;                       // Cached inner ellipse width.
  this.cachedTop = null;                          // Cached container position.
  this.cachedWidth = null;                        // Cached container width.
  this.updateWidth();
  document.addEventListener("mousemove", this.onmouse.bind(this), true);
  document.addEventListener("mouseenter", this.onmouse.bind(this), true);
  document.addEventListener("mouseleave", this.onmouse.bind(this), true);
  document.addEventListener("scroll", this.onscroll.bind(this), true);
  window.addEventListener("resize", this.onresize.bind(this), true);
  this.requestFrame();
}

Animation.prototype.updateWidth = function() {
  if (this.cachedViewWidth !== document.documentElement.clientWidth) {
    this.cachedViewWidth = document.documentElement.clientWidth;
    this.cachedIndent =
        parseFloat(getComputedStyle(document.querySelector(".row"))
                       .getPropertyValue("padding-left"));
    this.cachedTop = this.container.offsetTop;
    this.cachedWidth = this.container.offsetWidth;
    this.rows.forEach(function(row) { row.updateWidth(); });
    this.container.style.position = "fixed";
    this.shadow.style.width = this.cachedWidth + "px";
    this.shadow.style.height = this.container.offsetHeight + "px";
  }
};

Animation.prototype.requestFrame = function() {
  if (!this.animating) {
    requestAnimationFrame(this.onframeCallback);
    this.animating = true;
  }
};

Animation.prototype.onmouse = function(event) {
  if (this.curMouse !== event.clientY) {
    this.curMouse = event.clientY;
    this.mouseTime = performance.now();
  }
  this.requestFrame();
};

Animation.prototype.onscroll = function(event) { this.requestFrame(); };

Animation.prototype.onresize = function(event) {
  this.updateWidth();
  this.requestFrame();
};

Animation.prototype.onframe = function(timestamp) {
  if (this.startTime === null) {
    this.startTime = timestamp;
  }

  var viewHeight = window.innerHeight;
  var docHeight = document.documentElement.scrollHeight;
  var maxScroll = docHeight - viewHeight;
  var curScroll = window.scrollY;
  var newScroll = this.curMouse / viewHeight * maxScroll;

  // Update spring displacement if mouse moved since the last frame.
  if (this.curMouse !== this.prevMouse) {
    var frac = this.spring.resting() ? MAX_JUMP : MAX_SNAP;
    if (Math.abs(newScroll - curScroll) > viewHeight * frac) {
      if (this.spring.resting())
        this.prevTime = this.mouseTime;
      this.spring.displacement = newScroll - curScroll;
    } else {
      this.spring.reset();
    }
  } else if (curScroll !== this.prevScroll) {
    // If the mouse hasn't moved since the last frame, but the scroll position
    // has changed, it means there was external scrolling so stop any animation
    // and just keep the current position.
    this.spring.reset();
    newScroll = null;
  }

  if (newScroll !== null) {
    // Smooth out jumps in newScroll value using damped spring simulation.
    if (!this.spring.resting()) {
      this.spring.step(timestamp - this.prevTime);
      if (Math.abs(this.spring.displacement) >= .5 ||
          Math.abs(this.spring.velocity) > .5) {
        newScroll -= this.spring.displacement;
      } else {
        // Stop animation since spring is so close to rest position.
        this.spring.reset();
      }
    }

    newScroll = Math.max(0, Math.min(Math.round(newScroll), maxScroll));
  }

  // Update container position.
  var scrollY = newScroll !== null ? newScroll : curScroll;
  this.container.style.transform = "translateY(" + (-scrollY) + "px)";

  // Update rows and find highlighted row corresponding to scroll position.
  var highlightRow = null;
  var highlightRowDistance = null;
  var highlightRowPosition = docHeight * scrollY / maxScroll;
  var anim = this;
  this.rows.forEach(function(row) {
    row.updatePosition(timestamp - anim.startTime, anim.cachedIndent,
                       viewHeight, scrollY);
    var rowDist =
        Math.abs(row.cachedTop + row.cachedHeight / 2 - highlightRowPosition);
    if (highlightRowDistance === null || highlightRowDistance > rowDist) {
      highlightRow = row;
      highlightRowDistance = rowDist;
    }
  });

  // Update highlighted row if opening animation is finished.
  var animActive = timestamp - this.startTime <= ANIM_TOTAL_DURATION;
  if (!animActive) {
    moveHighlight(this.prevRow && this.prevRow.section, highlightRow.section);
    moveHighlight(this.prevRow, highlightRow);
  }

  // Update inner and outer ellipse positions.
  this.innerEllipse.style.transform = "translate(" + (-this.cachedIndent) +
                                      "px, " + (scrollY - this.cachedTop) +
                                      "px)";
  this.innerEllipse.style.height = viewHeight + "px";
  this.innerEllipse.style.width = (2 * this.cachedIndent) + "px";
  this.outerEllipse.style.transform =
      "translate(" + (-this.cachedIndent - this.cachedWidth) + "px, " +
      (scrollY - this.cachedTop - this.cachedIndent) + "px)";
  this.outerEllipse.style.width = (this.cachedWidth * 2) + "px";
  this.outerEllipse.style.height = viewHeight + "px";
  this.outerEllipse.style.borderRadius = (this.cachedIndent * 2) + "px/" +
                                         (viewHeight / 2 + this.cachedIndent) +
                                         "px";
  this.outerEllipse.style.borderWidth = this.cachedIndent + "px";

  // Reveal separator lines if opening animation is starting.
  if (timestamp == this.startTime) {
    [].forEach.call(document.querySelectorAll(".separator"),
                    function(elem) { elem.classList.add("reveal"); });
  }

  // Update scroll position if it is changing.
  if (newScroll !== null && curScroll != newScroll)
    window.scroll(0, newScroll);

  // Update saved state and request next frame.
  this.animating = animActive || !this.spring.resting();
  this.prevScroll = newScroll;
  this.prevMouse = this.curMouse;
  this.prevTime = timestamp;
  this.prevRow = highlightRow;
  if (this.animating)
    requestAnimationFrame(this.onframeCallback);
};

function Section(elem) {
  this.elem = elem;
  this.highlighted = false;
}

function Row(elem, rowtext, section) {
  this.elem = elem;
  this.rowtext = rowtext;
  this.section = section;
  this.highlighted = false;
}

Row.prototype.updateWidth = function() {
  // Position relative to page (parent is container, parent of parent is null).
  this.cachedTop = this.rowtext.offsetTop + this.rowtext.offsetParent.offsetTop;
  this.cachedHeight = this.rowtext.offsetHeight;
};

Row.prototype.updatePosition = function(animTime, indent, viewHeight, scrollY) {
  var rowTop = this.cachedTop - scrollY;

  // Find vertical displacement, y, from center of ellipse to the top of this
  // row.
  var y = rowTop - viewHeight / 2;

  // Find horizontal displacement, x, from center of ellipse to the left edge of
  // this row, where the edge is touching the ellipse.
  var radiusW = indent;
  var radiusH = viewHeight / 2;
  var minY = y;
  if (minY + this.cachedHeight < 0) {
    minY += this.cachedHeight;
  } else if (minY < 0) {
    minY = 0;
  }
  var x = Math.abs(minY) >= radiusH
              ? 0
              : Math.sqrt(radiusH * radiusH - minY * minY) * radiusW / radiusH;

  var transform = "translateX(" + (x - indent) + "px)";
  var transformOrigin = "";
  var visibility = "";

  // Show opening animation for rows visible in viewport.
  if (rowTop + this.cachedHeight >= 0 && rowTop <= viewHeight) {
    // Find angle of rotation, a, around (x, -y, 0) axis originating at the
    // center of ellipse, corresponding to time, animTime, in the loading
    // animation. Angle of rotation starts at 90 and ends at 0 so the rows are
    // in circular orbits around the center of ellipse and look like they are
    // falling back into place.
    var start_a = 90;
    var end_a = 0;
    var delay = (ANIM_TOTAL_DURATION - ANIM_ROW_DURATION) * rowTop / viewHeight;
    var a =
        start_a + (end_a - start_a) * (animTime - delay) / ANIM_ROW_DURATION;
    if (a > start_a) {
      visibility = "hidden";
    } else if (a > end_a) {
      transform +=
          " rotate3d(" + (y) + ", " + (-x) + ", " + 0 + "," + a + "deg)";
      transformOrigin = (-x) + "px " + (-y) + "px";
    }
  }

  this.rowtext.style.transform = transform;
  this.rowtext.style.transformOrigin = transformOrigin;
  this.rowtext.style.visibility = visibility;
};

function moveHighlight(source, dest) {
  if (source !== dest && source && source.highlighted) {
    source.elem.classList.remove("highlight");
    source.highlighted = false;
  }
  if (!dest.highlighted) {
    dest.elem.classList.add("highlight");
    dest.highlighted = true;
  }
}

// Simulate damped spring, where at any time acceleration is equal to
// displacement times a negative stiffness factor plus velocity times a negative
// damping factor. Implicitly choose the damping factor so the spring is
// critically damped (has the minimum damping needed to prevent oscillation).
function DampedSpring() {
  // Current position and velocity.
  this.displacement = this.velocity = 0;
  // Spring constant, acceleration per unit displacement.
  this.stiffness = .001;
}

// Step forward in time, updating spring position and velocity, which both
// move towards 0 as the spring returns to the rest position.
DampedSpring.prototype.step = function(t) {
  // Displacement formula from
  // https://en.wikipedia.org/wiki/Damping#Critical_damping_.28.CE.B6_.3D_1.29
  var w0 = Math.sqrt(this.stiffness);
  var A = this.displacement;
  var B = this.velocity + w0 * A;
  var E = Math.exp(-w0 * t);
  this.displacement = (A + B * t) * E;
  // Derivative of above w.r.t. time.
  this.velocity = (-w0 * (A + B * t) + B) * E;
};

DampedSpring.prototype.reset = function() {
  this.displacement = this.velocity = 0;
};

DampedSpring.prototype.resting = function() {
  return this.displacement === 0 && this.velocity === 0;
};

// Amount of time it takes for one row to move into place (complete 90° orbit)
// during opening animation (ms).
var ANIM_ROW_DURATION = 500;

// Total length of opening animation (ms).
var ANIM_TOTAL_DURATION = 1000;

// Start smooth scrolling animation if mouse move event happens that would
// change scroll position by less than this amount (fraction of viewport
// height).
var MAX_JUMP = .2;

// End smooth scrolling animation if mouse move event happens that would change
// scroll position by less than this amount (fraction of viewport height).
var MAX_SNAP = .1;

// Run the code.
addHtml();
