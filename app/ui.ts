export const format = (value: number) => value.toLocaleString('en-US');
export const asset = (name: string) => import.meta.env.BASE_URL + name;
export const remaining = (deadline: number, now: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
