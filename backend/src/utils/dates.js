export function todayIn(timeZone = 'Asia/Karachi') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function monthStartIn(timeZone) {
  return `${todayIn(timeZone).slice(0, 7)}-01`;
}
