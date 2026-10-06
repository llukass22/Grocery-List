'use strict';
const fs=require('node:fs');
const path=require('node:path');
const mysql=require('mysql2/promise');
const project=path.resolve(__dirname,'..');
const admin=JSON.parse(fs.readFileSync(path.join(project,'.local-db/admin.json'),'utf8'));
async function connect(){
  for(let attempt=0;attempt<60;attempt++){
    try{return await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password:admin.password,connectTimeout:1000});}
    catch(error){if(attempt===59)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
  }
}
(async()=>{
  const connection=await connect();
  try{
    if(process.argv[2]==='shutdown'){await connection.query('SHUTDOWN');console.log('MariaDB shut down cleanly.');}
    else if(process.argv[2]==='initialize'){
      const env=require('dotenv').parse(fs.readFileSync(path.join(project,'.env')));
      await connection.query('CREATE DATABASE IF NOT EXISTS basket_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
      await connection.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [env.DB_USER,'127.0.0.1',env.DB_PASSWORD]);
      await connection.query('GRANT SELECT, INSERT, UPDATE, DELETE ON basket_local.* TO ?@?', [env.DB_USER,'127.0.0.1']);
      await connection.query('USE basket_local');
      for(const statement of fs.readFileSync(path.join(project,'schema.sql'),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await connection.query(statement);
      console.log('Local database, limited app user, and schema created.');
    }else{await connection.query('SELECT 1');console.log('MariaDB is ready.');}
  }finally{await connection.end();}
})().catch(error=>{console.error('Local database operation failed:',error.code||error.message);process.exitCode=1;});
