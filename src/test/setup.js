import '@testing-library/jest-dom'

// jsdom's Blob/File don't implement arrayBuffer() (real browsers have since
// 2019). Polyfill it via FileReader so code that reads blob bytes (e.g. the
// video-remux helper) can be unit-tested.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
