// touchControls.js
// depends on Hammer.js: https://hammerjs.github.io/

(function(window, document, Hammer, THREE) {
    function enableTouchControls(domElement, controls) {
      // Let OrbitControls handle rotate/pan/pinch natively:
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
  
      // Now wire up taps via Hammer:
      const mc = new Hammer.Manager(domElement);
      mc.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
      mc.add(new Hammer.Tap({ event: 'singletap', taps: 1 }));
      mc.get('doubletap').recognizeWith('singletap');
      mc.get('singletap').requireFailure('doubletap');
      mc.add(new Hammer.Press({ event: 'twofingertap', pointers: 2, time: 300 }));
  
      // single‐finger tap → dispatch a mouse‐click so your onMouseClick picks it up
      mc.on('singletap', ev => {
        const rect = domElement.getBoundingClientRect();
        const clickEvt = new MouseEvent('click', {
          clientX: ev.center.x - rect.left,
          clientY: ev.center.y - rect.top,
          bubbles: true,
          cancelable: true
        });
        domElement.dispatchEvent(clickEvt);
      });
  
      // double‐tap → zoom in
      mc.on('doubletap', () => {
        if (typeof window.zoomView === 'function') window.zoomView(0.8);
      });
  
      // two‐finger tap → zoom out
      mc.on('twofingertap', () => {
        if (typeof window.zoomView === 'function') window.zoomView(1.2);
      });
  
      // pinch is already handled by OrbitControls, so we don’t rewire it here
    }
  
    window.enableTouchControls = enableTouchControls;
  })(window, document, window.Hammer, window.THREE);
  