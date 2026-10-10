document.querySelectorAll('[data-phrase]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.querySelector('#message-input');
    input.value = button.dataset.phrase;
    input.focus();
  });
});
