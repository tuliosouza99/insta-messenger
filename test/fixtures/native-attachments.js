// Synthetic button-based message cards. Native handlers deliberately depend on
// their original DOM ancestry, as Instagram's player and carousel do.
document.addEventListener('click', async event => {
  const card = event.target.closest('#native-reel, #native-carousel');
  if (!card) return;
  const modal = document.createElement('div');
  modal.dataset.nativeTestModal = '';
  modal.innerHTML = '<button aria-label="Close">Close</button><div id="native-stage"></div><section id="native-recommendation"><img width="640" height="480" src="https://scontent.cdninstagram.com/unrelated.svg"><button aria-label="Next Reel">Next Reel</button></section>';
  modal.querySelector('[aria-label="Close"]').addEventListener('click', () => modal.remove());
  const stage = modal.querySelector('#native-stage');
  if (card.id === 'native-reel') {
    stage.innerHTML = '<video width="320" height="240"></video><img id="native-poster" alt="Video cover" width="320" height="240" src="https://scontent.cdninstagram.com/poster.svg" style="position:absolute;inset:0;z-index:2">';
    const video = stage.querySelector('video');
    document.body.append(modal);
    const bytes = await fetch('https://scontent.cdninstagram.com/native.mp4').then(response => response.arrayBuffer());
    const stream = new MediaSource();
    video.src = URL.createObjectURL(stream);
    stream.addEventListener('sourceopen', () => {
      if (video.parentElement !== stage) throw new Error('Native player detached during initialization');
      const buffer = stream.addSourceBuffer('video/mp4; codecs="avc1.42C01E"');
      buffer.addEventListener('updateend', () => stream.endOfStream(), { once: true });
      buffer.appendBuffer(bytes);
    }, { once: true });
  } else {
    stage.style.cssText = 'position:relative;width:320px;height:240px;overflow:hidden';
    stage.innerHTML = '<div id="native-strip" style="display:flex;width:max-content"><img data-current width="320" height="240" alt="Photo 1" style="flex:none" src="https://scontent.cdninstagram.com/slide1.svg"><img width="320" height="240" alt="Photo 2" style="flex:none" src="https://scontent.cdninstagram.com/slide2.svg"></div><button aria-label="Go back" style="position:absolute;left:4px;top:45%" disabled>Previous</button><button aria-label="Next" style="position:absolute;right:4px;top:45%">Next</button>';
    let index = 1;
    const strip = stage.querySelector('#native-strip');
    stage.addEventListener('click', event => {
      if (event.target.parentElement !== stage || !event.target.matches('button')) return;
      index += event.target.getAttribute('aria-label') === 'Next' ? 1 : -1;
      if (index === 3 && strip.children.length < 3) strip.insertAdjacentHTML('beforeend', '<img width="320" height="240" alt="Photo 3" style="flex:none" src="https://scontent.cdninstagram.com/slide3.svg">');
      for (const image of strip.children) image.removeAttribute('data-current');
      strip.children[index - 1].setAttribute('data-current', '');
      strip.style.transform = `translateX(-${(index - 1) * 320}px)`;
      stage.querySelector('[aria-label="Go back"]').disabled = index === 1;
      stage.querySelector('[aria-label="Next"]').disabled = index === 3;
    });
    document.body.append(modal);
  }
});
