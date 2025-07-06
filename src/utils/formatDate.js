export const formatDate = (timestamp) => {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '';
  const date = timestamp.toDate();
  const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const formatted = new Intl.DateTimeFormat('ru-RU', options).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};
