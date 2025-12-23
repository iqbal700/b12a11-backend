require('dotenv').config()
const express = require('express')
const cors = require('cors')
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRETE);
const crypto = require('crypto');

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

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { parse } = require('path');
const { log } = require('console');
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

    // await client.connect();

    const database = client.db('projects-11DB');
    const userCollections = database.collection('user');
    const productCollections = database.collection('products');
    const bloodRequest = database.collection('blood');
    const PaymentsCollection = database.collection('payment');


    // all users database information ==-== //
    app.post('/users', async(req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = 'donor';
      userInfo.status = 'active';
      const result = await userCollections.insertOne(userInfo)
       res.send(result)
    })

    app.get('/users', verifyFBToken, async(req, res)=> {
        const result = await userCollections.find().toArray()
        console.log(result)
        res.status(200).send(result)
    })



    // ==-== update active and delete method ==-== //
    app.patch('/update/users/status', verifyFBToken, async(req, res) => {
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


    // ==-==  Blood Request api  ==-== //
    app.post('/request', verifyFBToken,  async(req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.request = 'pending'
      const result = await bloodRequest.insertOne(userInfo)
       res.send(result)
    })

    // get own adding blood request  
    app.get('/my-request', verifyFBToken, async(req, res) => {
      const email = req.decoded_email;
      const size = Number(req.query.size)
      const page = Number(req.query.page)
      const query = {email:email};
      const result = await bloodRequest
      .find(query)
      .limit(size)
      .skip(size*page)
      .toArray();

      const totalRequest = await bloodRequest.countDocuments(query)

      res.send({request:result,totalRequest});
    })

    // ==-== shwoing blood request pending information 

      app.get('/all-pending-requests', async (req, res) => {
        const query = { request: 'pending' };
        const result = await bloodRequest.find(query).toArray();
        res.send(result);
    });


    // ==-== update from pending to inprogress code ==-== //

    app.patch('/request/accept/:id', verifyFBToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                request: 'inprogress'
            },
        };
        const result = await bloodRequest.updateOne(query, updateDoc);
        res.send(result);
    });

      // to get the specific blood request id to show details
      app.get('/request-details/:id', async (req, res) => {
          const id = req.params.id;
          const result = await bloodRequest.findOne({ _id: new ObjectId(id) });
          res.send(result);
      });


    // ==-==  search specific zone information ==-== //

    app.get('/search-requests', async(req,res) => {
        const {bloodGroup, district, upazila} = req.query;

        const query = {};
        if(!query) {
          return;
        }

        if (bloodGroup) {
          const fixed = bloodGroup.replace(/ /g, "+").trim();
          query.blood = fixed
        }
        if (district) {
          query.district = district
        }
        if (upazila) {
          query.upazila = upazila
        }

        const result = await bloodRequest.find(query).toArray();
        res.send(result)
        console.log(query)

    })

    // Update User Profile
app.patch('/users/update-profile/:email', verifyFBToken, async (req, res) => {
    const email = req.params.email;
    const { name, photo } = req.body;
    const filter = { email: email };
    const updateDoc = {
        $set: {
            name: name,
            photoUrl: photo
        },
    };
    const result = await userCollections.updateOne(filter, updateDoc);
    res.send(result);
});


// ==-== Dashboard Statistics API ==-== //

   // ১. Admin/Volunteer Stats
app.get('/admin-stats', verifyFBToken, async (req, res) => {
  try {
    const totalUsers = await userCollections.countDocuments();
    const totalRequests = await bloodRequest.countDocuments();
    const pendingRequests = await bloodRequest.countDocuments({ request: 'pending' });
    
    // donation amount calculation logic
    const payments = await PaymentsCollection.find().toArray();
    const totalDonation = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

    res.send({
      totalUsers,
      totalRequests,
      pendingRequests,
      totalDonation
    });
  } catch (error) {
    res.status(500).send({ message: "Error fetching admin stats" });
  }
});

// ২. User Specific Stats
app.get('/user-stats/:email', verifyFBToken, async (req, res) => {
  const email = req.params.email; // এখান থেকে ইমেইল নিচ্ছি
  try {
    const myTotalRequests = await bloodRequest.countDocuments({ email: email });
    const myPendingRequests = await bloodRequest.countDocuments({ email: email, request: 'pending' });
    const myAcceptedRequests = await bloodRequest.countDocuments({ email: email, request: 'inprogress' });

    res.send({
      myTotalRequests,
      myPendingRequests,
      myAcceptedRequests
    });
  } catch (error) {
    res.status(500).send({ message: "Error fetching user stats" });
  }
});




    // ==-== payment creation and add stripe api ==-== 

    app.post('/create-payment-checkout', verifyFBToken, async(req, res) => {

      const donation = req.body;
      const amount = parseInt(donation.donateAmount) * 100;
      
      const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                product_data: {
                  name: 'please donate'
                },
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          metadata: {
              donorName: donation?.donorName,
          },
          customer_email: donation?.donorEmail,
          

          success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
          
      });

      res.send({url:session.url})

    })

    // ==-== save donating users information ==-== //

    app.post('/success-payment', async(req,res) => {
        const {session_id} = req.query;
        const session = await stripe.checkout.sessions.retrieve(
            session_id
      );
      console.log(session);

      const transactionId = session.payment_intent;
      
      const isPaymentExist = await PaymentsCollection.findOne({transactionId})

      if (isPaymentExist) {
        return res.status(400).send('already exist')
      }

      if(session.payment_status === 'paid') {
        const paymentInfo = {
          amount : session.amount_total/100,
          donorName: session.metadata.donorName, 
         donorPhone: session.metadata.donorPhone, 
          currency: session.currency,
          customer_Email: session.customer_email,
          transactionId,
          payment_status: session.payment_status,
          paidAt: new Date()
        }
        const result = await PaymentsCollection.insertOne(paymentInfo)
        return res.send(result)
      }
    })



  //  await client.db("admin").command({ ping: 1 });
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

