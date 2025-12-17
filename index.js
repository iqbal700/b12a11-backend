const express = require('express')
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 5000;

const app = express();
app.use(cors())
app.use(express.json())

// ==-== from firebase and ph github resources ==-== //
const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({

  credential: admin.credential.cert(serviceAccount)

});

// ==-== Making Middleware to ensure sucure api ==-== // 

const verifyFBToken = async(req, res, next) => {
const token = req.headers.authorization;

if(!token) {
  return res.status(401).send({message: 'unauthorize access'})
}

try{
  const idToken = token.split(' ')[1]
  const decoded = await admin.auth().verifyIdToken(idToken)
  console.log("decoded info:", decoded)
  req.decoded_email = decoded.email;
  next();
}
catch(error) {
  
   return res.status(401).send({message: 'unauthorize access'})
}

}

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w0obvc9.mongodb.net/?appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    await client.connect();

    const database = client.db('projects-11DB');
    const userCollections = database.collection('user');
    const productCollections = database.collection('products');
    const bloodRequest = database.collection('blood');


    // all users database information ==-== //
    app.post('/users', async(req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = 'donor';
      const result = await userCollections.insertOne(userInfo)
       res.send(result)
    })

    app.get('/users', verifyFBToken, async(req, res)=> {
        const result = await userCollections.find().toArray()
        res.status(200).send(result)
    })

    //==-== get single users ==-== //

    // app.get('/users/:email', async(req,res) => {
    //   const email = req.params.email
    //   const query = {email: email}
    //    const result = await userCollections.findOne(query)
    //    res.send(result)
    // })

    // ==-== update active and delete method ==-== //
    app.patch('update/user/status/', verifyFBToken, async(req, res) => {
       const {email, status} = req.query;
       const query = {email: email};
       const updateStatus = {
        $set : {
          status: status
        }
        
       }

       const result = await userCollections.updateOne(query, updateStatus)
       res.send(result)
    })

      app.get('/users/role/:email', async(req, res) => {
        const {email} = req.params;
        const query = {email: email}
        const result = await userCollections.findOne(query)
        res.send(result)
        console.log(result)
    })


    // Blood Request api 
    app.post('/request', verifyFBToken,  async(req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      const result = await bloodRequest.insertOne(userInfo)
       res.send(result)
    })

  


    // products 

    app.post('/products',  async(req, res) => {
        const data = req.body;
        data.createdAt = new Date();
        const result = await productCollections.insertOne(data);
        res.send(result)
    })


    // get own adding products 

    app.get('/manager/product/:email' , async(req, res) => {
      
      const email = req.params.email;
      const query = {email:email};

      const result = await productCollections.find(query).toArray();
      res.send(result);

    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
   // await client.close();

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("hello world")
})

app.listen(port, ()=>  {
    console.log(`server is running on ${port}`)
})

//new one

