/** Whether the bundle was built for production; outside a bundler, `process` is missing, and it isn't. */
export function isProduction(): boolean {
    try {
        return process.env.NODE_ENV === 'production';
    } catch {
        return false;
    }
}
