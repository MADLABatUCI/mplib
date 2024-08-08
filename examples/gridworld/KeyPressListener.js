/*class KeyPressListener {
  constructor(keyCode, callback) {
    let keySafe = true;
    this.keydownFunction = function(event) {
      if (event.code === keyCode) {
         if (keySafe) {
            keySafe = false;
            callback();
         }  
      }
   };
   this.keyupFunction = function(event) {
      if (event.code === keyCode) {
         keySafe = true;
      }         
   };
   document.addEventListener("keydown", this.keydownFunction);
   document.addEventListener("keyup", this.keyupFunction);
  }

  unbind() { 
    document.removeEventListener("keydown", this.keydownFunction);
    document.removeEventListener("keyup", this.keyupFunction);
  }


}
  */

class KeyPressListener {
   constructor(keyCode, callback) {
     this.keyCode = keyCode;
     this.callback = callback;
     this.keydownFunction = this.keydownFunction.bind(this);
     this.keyupFunction = this.keyupFunction.bind(this);
 
     document.addEventListener("keydown", this.keydownFunction);
     document.addEventListener("keyup", this.keyupFunction);
   }
 
   keydownFunction(event) {
     if (event.code === this.keyCode && activeKey === null) {
       activeKey = this.keyCode;
       this.callback();
     }
   }
 
   keyupFunction(event) {
     if (event.code === this.keyCode) {
       activeKey = null;
     }
   }
 
   unbind() {
     document.removeEventListener("keydown", this.keydownFunction);
     document.removeEventListener("keyup", this.keyupFunction);
   }
 }
 
 
 