/**
 * SSH Utility для подключения к VPN серверу
 * Task 8.2: SSH подключение к VPN серверу
 */

import { Client as SSHClient } from "ssh2";
import fs from "fs";
import os from "os";

class SSHHelper {
  constructor(config = {}) {
    this.host = config.host || process.env.SERVER_IP || "localhost";
    this.port = config.port || parseInt(process.env.SSH_PORT) || 22;
    this.username = config.username || process.env.SSH_USERNAME || "root";
    this.password = config.password || process.env.SSH_PASSWORD;
    this.privateKeyPath = config.privateKeyPath || process.env.SSH_KEY_PATH || `${os.homedir()}/.ssh/id_rsa`;
    this.timeout = config.timeout || 10000;
  }

  /**
   * Выполнить команду на удаленном сервере
   * @param {string} command - Команда для выполнения
   * @returns {Promise<string>} - Вывод команды
   */
  executeCommand(command) {
    return new Promise((resolve, reject) => {
      const conn = new SSHClient();
      let output = "";
      let errorOutput = "";

      // Подготовка конфигурации подключения
      const connConfig = {
        host: this.host,
        port: this.port,
        username: this.username,
        readyTimeout: this.timeout,
      };

      // Использовать пароль если доступен, иначе пробовать ключ
      if (this.password) {
        connConfig.password = this.password;
      } else if (fs.existsSync(this.privateKeyPath)) {
        connConfig.privateKey = fs.readFileSync(this.privateKeyPath);
      } else {
        return reject(
          new Error(
            `SSH аутентификация не удалась: нет пароля и ключ не найден по пути ${this.privateKeyPath}`
          )
        );
      }

      conn
        .on("ready", () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            stream
              .on("close", (code, signal) => {
                conn.end();
                if (code !== 0 && errorOutput) {
                  reject(
                    new Error(
                      errorOutput || `Команда завершилась с кодом ${code}`
                    )
                  );
                } else {
                  resolve(output);
                }
              })
              .on("data", (data) => {
                output += data.toString();
              })
              .stderr.on("data", (data) => {
                errorOutput += data.toString();
              });
          });
        })
        .on("error", (err) => {
          reject(err);
        })
        .connect(connConfig);
    });
  }

  /**
   * Выполнить скрипт на удаленном сервере
   * @param {string} scriptPath - Путь к скрипту на сервере
   * @param {Array<string>} args - Аргументы скрипта
   * @returns {Promise<string>} - Вывод скрипта
   */
  async executeScript(scriptPath, args = []) {
    const command = `bash ${scriptPath} ${args.join(" ")}`;
    return this.executeCommand(command);
  }

  /**
   * Проверить подключение к серверу
   * @returns {Promise<boolean>} - true если подключение успешно
   */
  async testConnection() {
    try {
      await this.executeCommand("echo 'test'");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Получить статус сервиса systemd
   * @param {string} serviceName - Имя сервиса
   * @returns {Promise<Object>} - Статус сервиса
   */
  async getServiceStatus(serviceName) {
    try {
      const output = await this.executeCommand(
        `systemctl is-active ${serviceName} && systemctl is-enabled ${serviceName}`
      );
      const lines = output.trim().split("\n");
      return {
        active: lines[0] === "active",
        enabled: lines[1] === "enabled",
      };
    } catch (error) {
      return {
        active: false,
        enabled: false,
        error: error.message,
      };
    }
  }

  /**
   * Перезапустить сервис systemd
   * @param {string} serviceName - Имя сервиса
   * @returns {Promise<boolean>} - true если успешно
   */
  async restartService(serviceName) {
    try {
      await this.executeCommand(`sudo systemctl restart ${serviceName}`);
      return true;
    } catch (error) {
      throw new Error(`Не удалось перезапустить ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Прочитать файл с сервера
   * @param {string} filePath - Путь к файлу
   * @returns {Promise<string>} - Содержимое файла
   */
  async readFile(filePath) {
    return this.executeCommand(`cat ${filePath}`);
  }

  /**
   * Записать файл на сервер
   * @param {string} filePath - Путь к файлу
   * @param {string} content - Содержимое файла
   * @returns {Promise<boolean>} - true если успешно
   */
  async writeFile(filePath, content) {
    try {
      // Экранируем содержимое для безопасной передачи
      const escapedContent = content.replace(/'/g, "'\\''");
      await this.executeCommand(`echo '${escapedContent}' > ${filePath}`);
      return true;
    } catch (error) {
      throw new Error(`Не удалось записать файл ${filePath}: ${error.message}`);
    }
  }
}

export default SSHHelper;
