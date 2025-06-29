const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cvlwqch.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;

    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyEmail = (req, res, next) => {
  if (req.query.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

async function run() {
  try {
    const foodCollections = client.db("foodDB").collection("foods");
    const requestCollections = client.db("foodDB").collection("requested");

    app.get("/getFoodLargeQuantity", async (req, res) => {
      const query = {
        status: "available",
      };
      const cursor = foodCollections
        .find(query)
        .sort({ quantity: -1 })
        .skip(0)
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/getFoodStatus", async (req, res) => {
      const search = req.query.search;

      let query = {
        name: { $regex: search, $options: "i" },
        status: "available",
      };
      const cursor = foodCollections
        .find(query)
        .sort({ date: -1 })
        .skip(0)
        .limit(0);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/food/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollections.findOne(query);
      res.send(result);
    });

    app.get(
      "/foodsByEmail",
      verifyFirebaseToken,
      verifyEmail,
      async (req, res) => {
        const email = req.query.email;
        const query = {
          donorEmail: email,
        };
        const cursor = foodCollections.find(query);
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    app.post("/foods", async (req, res) => {
      const newFood = req.body;
      newFood.quantity = parseInt(newFood.quantity);
      const result = await foodCollections.insertOne(newFood);
      res.send({ message: "food added successfully", data: result });
    });

    app.put("/foodUpdate/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateFood = req.body;
      const updatedDoc = {
        $set: updateFood,
      };
      const options = { upsert: true };
      const result = await foodCollections.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    app.delete("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollections.deleteOne(query);
      res.send(result);
    });

    // food request api
    app.get("/requests", verifyFirebaseToken, verifyEmail, async (req, res) => {
      const email = req.query.email;

      const filter = { reqEmail: email, status: "requested" };
      const result = await requestCollections.find(filter).toArray();
      res.send(result);
    });

    app.post("/requested", async (req, res) => {
      const newRequest = req.body;
      const result = await requestCollections.insertOne(newRequest);
      await foodCollections.updateOne(
        { _id: new ObjectId(newRequest.foodId) },
        { $set: { status: "requested" } }
      );
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("welcome to my zero waste meals server");
});

app.listen(port, () => {
  console.log(`zero waste meals server running on port ${port}`);
});
