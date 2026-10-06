'use strict';
const mysql = require('mysql2/promise');

function createStore(env = process.env) {
  for (const key of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!env[key]) throw new Error(`Missing ${key}; see .env.example.`);
  }
  const pool = mysql.createPool({host: env.DB_HOST, port: Number(env.DB_PORT || 3306),
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
    charset: 'utf8mb4', connectionLimit: 5, waitForConnections: true, queueLimit: 50,
    connectTimeout: 10000});
  async function read(connection = pool) {
    const [rows] = await connection.execute('SELECT id, name, quantity, done FROM basket_items WHERE list_id = 1 ORDER BY created_at, id');
    return rows.map(row => ({...row, done: Boolean(row.done)}));
  }
  async function write(action) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize list writes so clearing cannot race with an add or uncheck.
      const [lists] = await connection.execute('SELECT id FROM basket_lists WHERE id = 1 FOR UPDATE');
      if (!lists.length) throw new Error('Import schema.sql before starting Basket.');
      await action(connection);
      const items = await read(connection);
      await connection.commit();
      return items;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  return {
    read,
    add: items => write(async connection => {
      for (const item of items) await connection.execute(
        'INSERT INTO basket_items (id, name, quantity, done) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
        [item.id, item.name, item.quantity, item.done]);
    }),
    update: (id, changes) => write(async connection => {
      const fields = Object.keys(changes);
      const [result] = await connection.execute(`UPDATE basket_items SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ? AND list_id = 1`, [...fields.map(field => changes[field]), id]);
      if (!result.affectedRows) throw Object.assign(new Error('Item no longer exists.'), {status: 404});
    }),
    remove: id => write(connection => connection.execute('DELETE FROM basket_items WHERE id = ? AND list_id = 1', [id])),
    clear: () => write(async connection => {
      const [rows] = await connection.execute('SELECT id FROM basket_items WHERE list_id = 1 AND done = 0 LIMIT 1');
      if (rows.length) throw Object.assign(new Error('Check off every item before clearing the list.'), {status: 409});
      await connection.execute('DELETE FROM basket_items WHERE list_id = 1');
    }),
    close: () => pool.end()
  };
}
module.exports = {createStore};
