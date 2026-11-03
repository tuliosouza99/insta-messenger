const reason = new URLSearchParams(location.search).get('reason');
if (reason === 'signin') {
  document.querySelector('h1').textContent = 'Sign in directly with Instagram';
  document.querySelector('#description').textContent = 'Use your Instagram username and password in this app. This sign-in method opens another website and isn’t supported here yet.';
} else if (reason === 'reset') {
  document.querySelector('h1').textContent = 'Making a fresh start';
  document.querySelector('#description').textContent = 'Clearing your local Instagram session…';
}
document.querySelector('#retry').addEventListener('click', () => window.messenger.recover('retry'));
document.querySelector('#inbox').addEventListener('click', () => window.messenger.recover('inbox'));
