const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const imagemagick = require('imagemagick');

class iMessageExporter {
  constructor(dbPath, outputFolder, startDate, endDate) {
    this.db = new sqlite3.Database(dbPath);
    this.outputFolder = outputFolder;
    this.startDate = new Date(startDate).getTime() / 1000;
    this.endDate = new Date(endDate).getTime() / 1000;
  }

  async exportMessages() {
    const contacts = await this.getContacts();
    const groupChats = await this.getGroupChats();

    for (const contact of contacts) {
      await this.exportContactMessages(contact);
    }

    for (const groupChat of groupChats) {
      await this.exportGroupChatMessages(groupChat);
    }

    this.db.close();
  }

  async getContacts() {
    return new Promise((resolve, reject) => {
      this.db.all(`
                SELECT DISTINCT handle.id, handle.service
                FROM handle
                JOIN message ON handle.ROWID = message.handle_id
                WHERE message.date >= ? AND message.date <= ?
            `, [this.startDate, this.endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getGroupChats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
                SELECT DISTINCT chat.chat_identifier, chat.display_name
                FROM chat
                JOIN chat_message_join ON chat.ROWID = chat_message_join.chat_id
                JOIN message ON chat_message_join.message_id = message.ROWID
                WHERE message.date >= ? AND message.date <= ?
                AND chat.style = 43 -- Group chats
            `, [this.startDate, this.endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async exportContactMessages(contact) {
    const messages = await this.getMessages(contact.id);
    const outputPath = path.join(this.outputFolder, `${contact.id}.txt`);
    const writeStream = fs.createWriteStream(outputPath);

    for (const message of messages) {
      writeStream.write(`${message.is_from_me ? 'Me' : contact.id}|${message.date}|${message.text}\n`);
      if (message.attachment_path) {
        const attachmentPath = await this.processAttachment(message.attachment_path);
        writeStream.write(`ATTACHMENT|${attachmentPath}\n`);
      }
    }

    writeStream.end();
  }

  async exportGroupChatMessages(groupChat) {
    const messages = await this.getGroupMessages(groupChat.chat_identifier);
    const outputPath = path.join(this.outputFolder, `${groupChat.display_name || groupChat.chat_identifier}.txt`);
    const writeStream = fs.createWriteStream(outputPath);

    for (const message of messages) {
      writeStream.write(`${message.sender}|${message.date}|${message.text}\n`);
      if (message.attachment_path) {
        const attachmentPath = await this.processAttachment(message.attachment_path);
        writeStream.write(`ATTACHMENT|${attachmentPath}\n`);
      }
    }

    writeStream.end();
  }

  async getMessages(contactId) {
    return new Promise((resolve, reject) => {
      this.db.all(`
                SELECT message.text, message.date, message.is_from_me, attachment.filename as attachment_path
                FROM message
                LEFT JOIN message_attachment_join ON message.ROWID = message_attachment_join.message_id
                LEFT JOIN attachment ON message_attachment_join.attachment_id = attachment.ROWID
                WHERE message.handle_id = ?
                AND message.date >= ? AND message.date <= ?
                ORDER BY message.date ASC
            `, [contactId, this.startDate, this.endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getGroupMessages(chatIdentifier) {
    return new Promise((resolve, reject) => {
      this.db.all(`
                SELECT message.text, message.date, handle.id as sender, attachment.filename as attachment_path
                FROM message
                JOIN chat_message_join ON message.ROWID = chat_message_join.message_id
                JOIN chat ON chat_message_join.chat_id = chat.ROWID
                LEFT JOIN handle ON message.handle_id = handle.ROWID
                LEFT JOIN message_attachment_join ON message.ROWID = message_attachment_join.message_id
                LEFT JOIN attachment ON message_attachment_join.attachment_id = attachment.ROWID
                WHERE chat.chat_identifier = ?
                AND message.date >= ? AND message.date <= ?
                ORDER BY message.date ASC
            `, [chatIdentifier, this.startDate, this.endDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async processAttachment(attachmentPath) {
    if (!attachmentPath) return null;

    const attachmentFolder = path.join(this.outputFolder, 'attachments');
    if (!fs.existsSync(attachmentFolder)) {
      fs.mkdirSync(attachmentFolder, { recursive: true });
    }

    const newPath = path.join(attachmentFolder, path.basename(attachmentPath));

    // if (path.extname(attachmentPath).toLowerCase() === '.heic') {
    //   const jpegPath = newPath.replace('.heic', '.jpg');
    //   await this.convertHeicToJpeg(attachmentPath, jpegPath);
    //   return path.relative(this.outputFolder, jpegPath);
    // } else {
    fs.copyFileSync(attachmentPath, newPath);
    return path.relative(this.outputFolder, newPath);
    // }
  }

  convertHeicToJpeg(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      imagemagick.convert([inputPath, outputPath], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
