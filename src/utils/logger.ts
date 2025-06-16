/**
 * Utility functions for console logging with consistent formatting
 */
export class Logger {
    private static readonly PREFIX = '[Moodle Downloader]';

    static info(message: string, ...args: any[]): void {
        console.log(`${this.PREFIX} ${message}`, ...args);
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(`${this.PREFIX} ${message}`, ...args);
    }

    static error(message: string, ...args: any[]): void {
        console.error(`${this.PREFIX} ${message}`, ...args);
    }
}
