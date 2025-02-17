// https://github.com/justinribeiro/html5-dragdroptouch-shim
export default class DragDropWithTouchSupportShim {
  /**
   * Creates an instance of PolyfillDragDropWithTouchSupport
   * @param {object} args
   * @param {number} [args.threshold=5]
   * @param {number} [args.opacity=0.8]
   * @param {number} [args.dblClick=500]
   * @param {number} [args.ctxMenu=900]
   * @param {boolean} [args.isPressHoldMode=false]
   * @param {number} [args.pressHoldAwait=400]
   * @param {number} [args.pressHoldMargin=25]
   * @param {number} [args.pressHoldThreshold=0]
   */
  constructor({
    threshold = 5,
    opacity = 0.8,
    dblClick = 500,
    ctxMenu = 900,
    isPressHoldMode = false,
    pressHoldAwait = 400,
    pressHoldMargin = 25,
    pressHoldThreshold = 0,
  } = {}) {
    this.setting = {
      THRESHOLD: threshold,
      OPACITY: opacity,
      DBL_CLICK: dblClick,
      CTX_MENU: ctxMenu,
      IS_PRESS_HOLD_MODE: isPressHoldMode,
      PRESS_HOLD_AWAIT: pressHoldAwait,
      PRESS_HOLD_MARGIN: pressHoldMargin,
      PRESS_HOLD_THRESHOLD: pressHoldThreshold,
    };

    this.setInternalHoldersToDefault();

    this.__removeAttributes = 'id,class,style,draggable'.split(',');
    this.__keyboardProperties = 'altKey,ctrlKey,metaKey,shiftKey'.split(',');
    this.__coordinateProperties = 'pageX,pageY,clientX,clientY,screenX,screenY'.split(',');

    document.addEventListener('touchstart', this.touchstart.bind(this), {
      passive: false,
      capture: false,
    });
    document.addEventListener('touchmove', this.touchmove.bind(this), {
      passive: false,
      capture: false,
    });
    document.addEventListener('touchend', this.touchend.bind(this));
    document.addEventListener('touchcancel', this.touchend.bind(this));
  }

  /**
   * Set the world
   */
  setInternalHoldersToDefault() {
    this._destroyImage();
    this._dragSource = null;
    this._lastTouch = null;
    this._lastTarget = null;
    this._ptDown = null;
    this._isDragEnabled = false;
    this._isDropZone = false;
    this._dataTransfer = new DataTransfer();
    clearInterval(this._pressHoldInterval);
  }

  touchstart(event) {
    if (this.__shouldHandleEvent(event)) {
      // raise double-click and prevent zooming
      if (Date.now() - this._lastClick < this.setting.DBL_CLICK) {
        if (
          this._dispatchEvent(event, 'mousedown', event.composedPath()[0]) ||
          this._dispatchEvent(event, 'dblclick', event.composedPath()[0])
        ) {
          event.preventDefault();
          this.setInternalHoldersToDefault();
          return;
        }
      }
      this.setInternalHoldersToDefault();
      const sourceElementThatIsDragging = this.__findClosestDraggable(event);

      if (sourceElementThatIsDragging) {
        // give caller a chance to handle the hover/move events
        if (
          !this._dispatchEvent(event, 'mousemove', event.composedPath()[0]) &&
          !this._dispatchEvent(event, 'mousedown', event.composedPath()[0])
        ) {
          // get ready to start dragging
          this._dragSource = sourceElementThatIsDragging;
          this._ptDown = this._getPoint(event);
          this._lastTouch = event;
          event.preventDefault();
          // show context menu if the user hasn't started dragging after a while
          setTimeout(() => {
            if (this._dragSource === sourceElementThatIsDragging && this._img == null) {
              if (this._dispatchEvent(event, 'contextmenu', sourceElementThatIsDragging)) {
                this.setInternalHoldersToDefault();
              }
            }
          }, this.setting.CTX_MENU);
          if (this.setting.IS_PRESS_HOLD_MODE) {
            this._pressHoldInterval = setTimeout(() => {
              this._isDragEnabled = true;
              this.touchmove(event);
            }, this.setting.PRESS_HOLD_AWAIT);
          }
        }
      }
    }
  }

  touchmove(event) {
    if (this._shouldCancelPressHoldMove(event)) {
      this.setInternalHoldersToDefault();
      return;
    }
    if (this._shouldHandleMove(event) || this._shouldHandlePressHoldMove(event)) {
      let targets = this.__getDragOverTargets(event);
      if (targets.includes(this._lastTarget)) targets = [this._lastTarget];
      for (const target of targets) {
        // see if target wants to handle move => exit
        if (this._dispatchEvent(event, 'mousemove', target)) {
          this._lastTouch = event;
          event.preventDefault();
          return;
        }
        // start dragging (if not already done)
        if (this._dragSource && !this._img && this._shouldStartDragging(event)) {
          this._dispatchEvent(event, 'dragstart', this._dragSource);
          this._createImage(event);
          this._dispatchEvent(event, 'dragenter', target);
          this._lastTarget = target;
        }
        // continue dragging
        if (this._img) {
          this._lastTouch = event;
          event.preventDefault(); // prevent scrolling
          if (target !== this._lastTarget) {
            this._dispatchEvent(this._lastTouch, 'dragleave', this._lastTarget);
            this._dispatchEvent(event, 'dragenter', target);
            this._lastTarget = target;
          }
          this._moveImage(event);
          this._isDropZone = this._dispatchEvent(event, 'dragover', target);
          if (this._isDropZone) break; // Don't go deeper if we have found a drop zone
        }
      }
    }
  }

  touchend(event) {
    if (this.__shouldHandleEvent(event)) {
      // see if target wants to handle up
      if (
        this._dispatchEvent(event, 'pointerup', event.composedPath()[0]) ||
        this._dispatchEvent(event, 'mouseup', event.composedPath()[0])
      ) {
        event.preventDefault();
        return;
      }
      // user clicked the element but didn't drag, so clear the source and simulate a click
      if (!this._img) {
        this._dragSource = null;
        this._dispatchEvent(event, 'click', event.composedPath()[0]);
        this._lastClick = Date.now();
      }
      // finish dragging
      this._destroyImage();

      if (this._dragSource) {
        if (event.type.indexOf('cancel') < 0) {
          this._dispatchEvent(this._lastTouch, 'drop', this._lastTarget);
        }
        this._dispatchEvent(this._lastTouch, 'dragend', this._dragSource);
        this.setInternalHoldersToDefault();
      }
    }
  }

  /**
   * Whether we should this is a touch event we should handle
   * @param {Event} event
   * @returns {Boolean}
   */
  __shouldHandleEvent(event) {
    return event && !event.defaultPrevented && event.touches && event.touches.length < 2;
  }

  // use regular condition outside of press & hold mode
  _shouldHandleMove(event) {
    return !this.setting.IS_PRESS_HOLD_MODE && this.__shouldHandleEvent(event);
  }

  /**
   * allow to handle moves that involve many touches for press & hold
   * @param {*} event
   * @returns
   */
  _shouldHandlePressHoldMove(event) {
    return (
      this.setting.IS_PRESS_HOLD_MODE &&
      this._isDragEnabled &&
      event &&
      event.touches &&
      event.touches.length
    );
  }

  // reset data if user drags without pressing & holding
  _shouldCancelPressHoldMove(event) {
    return (
      this.setting.IS_PRESS_HOLD_MODE &&
      !this._isDragEnabled &&
      this._getDelta(event) > this.setting.PRESS_HOLD_MARGIN
    );
  }

  /**
   * start dragging when specified delta is detected
   * @param {*} event
   * @returns
   */
  _shouldStartDragging(event) {
    const delta = this._getDelta(event);
    return (
      delta > this.setting.THRESHOLD ||
      (this.setting.IS_PRESS_HOLD_MODE && delta >= this.setting.PRESS_HOLD_THRESHOLD)
    );
  }

  // get point for a touch event
  _getPoint(event, page) {
    if (event && event.touches) {
      event = event.touches[0];
    }
    return {
      x: page ? event.pageX : event.clientX,
      y: page ? event.pageY : event.clientY,
    };
  }

  // get distance between the current touch event and the first one
  _getDelta(event) {
    if (this.setting.IS_PRESS_HOLD_MODE && !this._ptDown) {
      return 0;
    }
    const p = this._getPoint(event);
    return Math.abs(p.x - this._ptDown.x) + Math.abs(p.y - this._ptDown.y);
  }

  /**
   * Find the element(s) we're dragging over - with possible deeper elements in open shadow doms
   * @param {Event} event
   * @returns {Array<HTMLElement>}
   */
  __getDragOverTargets(event) {
    const point = this._getPoint(event);
    let element = document.elementFromPoint(point.x, point.y);
    const elements = [element];
    while (element && element.shadowRoot) {
      const deeperElement = element.shadowRoot.elementFromPoint(point.x, point.y);
      if (!deeperElement || deeperElement === element || deeperElement.nodeType !== 1) break;
      elements.push(deeperElement);
      element = deeperElement;
    }
    return elements;
  }

  // create drag image from source element
  _createImage(event) {
    // just in case...
    if (this._img) {
      this._destroyImage();
    }
    // create drag image from custom element or drag source
    const src = this._imgCustom || this._dragSource;
    this._img = src.cloneNode(true);
    this._copyStyle(src, this._img);
    this._img.style.top = this._img.style.left = '-9999px';
    // if creating from drag source, apply offset and opacity
    if (!this._imgCustom) {
      const rc = src.getBoundingClientRect();
      const pt = this._getPoint(event);
      this._imgOffset = { x: pt.x - rc.left, y: pt.y - rc.top };
      this._img.style.opacity = this.setting.OPACITY.toString();
    }
    // add image to document
    this._moveImage(event);
    document.body.appendChild(this._img);
  }

  // dispose of drag image element
  _destroyImage() {
    if (this._img && this._img.parentElement) {
      this._img.parentElement.removeChild(this._img);
    }
    this._img = null;
    this._imgCustom = null;
  }

  // move the drag image element
  _moveImage(event) {
    requestAnimationFrame(() => {
      if (this._img) {
        const pt = this._getPoint(event, true);
        const s = this._img.style;
        s.position = 'absolute';
        s.pointerEvents = 'none';
        s.zIndex = '999999';
        s.left = `${Math.round(pt.x - this._imgOffset.x)}px`;
        s.top = `${Math.round(pt.y - this._imgOffset.y)}px`;
      }
    });
  }

  // copy properties from an object to another
  _copyProps(dst, src, props) {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      dst[p] = src[p];
    }
  }

  _copyStyle(src, dst) {
    // remove potentially troublesome attributes
    this.__removeAttributes.forEach(att => dst.removeAttribute(att));

    // copy canvas content
    if (src instanceof HTMLCanvasElement) {
      dst.width = src.width;
      dst.height = src.height;
      dst.getContext('2d').drawImage(src, 0, 0);
    }

    // copy style (without transitions)
    const cs = window.getComputedStyle(src);
    Array.from(cs).forEach(key => {
      if (key.indexOf('transition') < 0)
        dst.style.setProperty(key, cs.getPropertyValue(key), cs.getPropertyPriority(key));
    });
    dst.style.setProperty('pointerEvents', 'none');

    // and repeat for all children
    for (let i = 0; i < src.children.length; i++) {
      this._copyStyle(src.children[i], dst.children[i]);
    }
  }

  _dispatchEvent(event, type, target) {
    if (event && target) {
      const evt = document.createEvent('Event');
      const t = event.touches ? event.touches[0] : event;
      evt.initEvent(type, true, true);
      evt.button = 0;
      evt.which = evt.buttons = 1;
      try {
        this._copyProps(evt, event, this.__keyboardProperties);
        this._copyProps(evt, t, this.__coordinateProperties);
      } catch (e) {}
      evt.dataTransfer = this._dataTransfer;
      target.dispatchEvent(evt);
      return evt.defaultPrevented;
    }
    return false;
  }

  /**
   * Find the closest draggable within the composedPath
   * @param {Event} event
   * @returns {HTMLElement}
   */
  __findClosestDraggable(event) {
    return event
      .composedPath()
      .find(i =>
        i.attributes
          ? i.hasAttribute('draggable') &&
            (i.getAttribute('draggable') === 'true' || i.getAttribute('draggable') === 'auto')
          : false,
      );
  }
}
