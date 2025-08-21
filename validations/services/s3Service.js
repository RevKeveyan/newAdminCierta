const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const moment = require('moment');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});

const uploadToS3 = async (fileBuffer, originalName, entity, type, id) => {
  const ext = path.extname(originalName);
  const filename = `${uuidv4()}${ext}`;
  const monthFolder = moment().format('MMMM');

  const key = `${monthFolder}/${entity}/${type}/${id}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeTypeByExt(ext),
    ACL: 'public-read'
  });

  await s3.send(command);

  return `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const deleteFromS3 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key: key
  });
  await s3.send(command);
};

const mimeTypeByExt = (ext) => {
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv'
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
};

module.exports = { uploadToS3, deleteFromS3 };
