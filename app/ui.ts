export const format = (value: number) => value.toLocaleString('en-US');
export const remaining = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
