export function getCurDate(today) {
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    return `${year}-${month}-${day}`;
}

export function getWeekNumber(today) {
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((today - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

export function getWeek(date) {
    return date.getFullYear() + '-' + getWeekNumber(date);
}

export function getMonth(date) {
    return date.getFullYear() + '-' + date.getMonth();
}