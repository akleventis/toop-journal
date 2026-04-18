import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const LOG_RETENTION_DAYS = 30; // days
export const LOG_RECENT_LINES = 200; // default lines loaded in the in-app log viewer

// Writes structured log entries to a daily log file, console, and the renderer via IPC.
// Log files live at userData/logs/app-YYYY-MM-DD.log, retained for LOG_RETENTION_DAYS days.
class Logger {
  private level: LogLevel;
  private logDir: string;

  constructor(level: LogLevel) {
    this.level = level;
    this.logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.clearCurrentLog();
    this.pruneOldLogs();
  }

  private get logFile(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `app-${date}.log`);
  }

  // clears the current day's log file on startup
  private clearCurrentLog(): void {
    try {
      fs.writeFileSync(this.logFile, '');
    } catch {
      // non-fatal
    }
  }

  // deletes log files older than LOG_RETENTION_DAYS
  private pruneOldLogs(): void {
    try {
      const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      for (const file of fs.readdirSync(this.logDir)) {
        if (!file.startsWith('app-') || !file.endsWith('.log')) continue;
        const filePath = path.join(this.logDir, file);
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // non-fatal — best-effort prune
    }
  }

  /**
   * Formats a log line as "[ISO_TIMESTAMP] [LEVEL] message ...args".
   *
   * @param {LogLevel} level
   * @param {string} message
   * @param {unknown[]} args
   * @returns {string}
   */
  private format(level: LogLevel, message: string, args: unknown[]): string {
    const ts = new Date().toISOString();
    const lvl = LogLevel[level];
    const extra = args.length
      ? ' ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      : '';
    return `[${ts}] [${lvl}] ${message}${extra}`;
  }

  /**
   * Gates on log level, then writes to disk, console, and the renderer via IPC.
   *
   * @param {LogLevel} level
   * @param {string} message
   * @param {...unknown[]} args
   */
  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level < this.level) return;
    const line = this.format(level, message, args);

    // sync write — survives crashes
    try {
      fs.appendFileSync(this.logFile, line + '\n');
    } catch {
      // if we can't write to log, at least console it
    }

    // console mirror
    level >= LogLevel.ERROR ? console.error(line) : console.log(line);

    // stream to renderer if window is open
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('logs:line', line);
      }
    }
  }

  debug(message: string, ...args: unknown[]): void { this.write(LogLevel.DEBUG, message, ...args); }
  info(message: string, ...args: unknown[]): void { this.write(LogLevel.INFO, message, ...args); }
  warn(message: string, ...args: unknown[]): void { this.write(LogLevel.WARN, message, ...args); }
  error(message: string, ...args: unknown[]): void { this.write(LogLevel.ERROR, message, ...args); }

  /**
   * Returns the last n lines from today's log file.
   *
   * @param {number} n - Number of lines to return. Defaults to LOG_RECENT_LINES.
   * @returns {string[]}
   */
  getRecentLines(n = LOG_RECENT_LINES): string[] {
    try {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      return content.split('\n').filter(l => l.trim()).slice(-n);
    } catch {
      return [];
    }
  }
}

// singleton — INFO in production, DEBUG in dev
export const logger = new Logger(
  app.isPackaged ? LogLevel.INFO : LogLevel.DEBUG
);
