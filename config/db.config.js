module.exports = {
  HOST: process.env.MONGODB_HOST,
  DB: process.env.MONGODB_DB,
  USER: process.env.MONGODB_USER,
  PASSWORD: process.env.MONGODB_PASSWORD,
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    autoIndex: true,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    family: 4,
    retryWrites: true,
    w: "majority"
  }
};