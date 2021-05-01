const express = require('express');
const app = express();
const mongodb = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
const mongoClient = mongodb.MongoClient;
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017';
const port = process.env.PORT || 5700;

app.use(express.json());
app.use(cors());

app.post('/signup',async(req,res)=>{
  try{
     let clientInfo = await mongoClient.connect(dbUrl);
     let db = clientInfo.db('app');
     let check = await db.collection('users').findOne({email:req.body.email});
     if(check){
       res.send(400).json({message:"User already present"});
     }
     else{
       let check2 =await db.collection('users').findOne({userName:req.body.userName}); 
       if(check2){
        res.send(422).json({message:"Username already present"});     
       }  
       else{
       let salt =await bcrypt.genSalt(10);
       let hash = await bcrypt.hash(req.body.password, salt);
       req.body.password = hash;
       let postData = {
           userName:req.body.userName,
           links:[]
       }
       let resp = await db.collection('users').insertOne(req.body);
       await db.collection('links').insertOne(postData);
       sendMail(req.body.email,'Linktree-clone Account Activation', "<p>Please Click <a href='http://localhost:3000/activation/"+ req.body.email +"'>here<a> to activate your account.</p>");      
       res.status(200).json({message:"User Created"});
       }
       clientInfo.close();
     }
  }
  catch(e){
     console.log(e);
  }
})

app.post('/login',async(req,res)=>{
   try{
    let clientInfo = await mongoClient.connect(dbUrl);
    let db = clientInfo.db('app');
    let check = await db.collection('users').findOne({userName:req.body.userName});
    if(check){
        let checkPassword = await bcrypt.compare(req.body.password, check.password); 
        if(checkPassword){
           let token = await jwt.sign(
               {user_id: check._id},
               process.env.JWT_KEY
           )

           let userdata={
              email: check.email,
              fullName:check.fullName,
              status:check.status             
           }
           res.status(200).json({message:"User logged In.",token:token,data:userdata})
        }
        else{
            res.send(400).json({message:"Incorrect password."});    
        }
    }
    else{
        res.send(404).json({message:"User not present"});
    }
    clientInfo.close();
   }
   catch(e){
      console.log(e);  
   }
})

//to send reset email to client and generate token for password reset.
app.post('/reset-pass-req',async(req,res)=>{
   try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('app');
      let id = Math.floor(Math.random()*(10000 - 1) +1);
      
      let check = await db.collection('users').findOne({userName:req.body.userName});
      if(check){
        let postData ={
            email:check.email,
            tokenId:id,
            tokenStatus:true
        }   
      await db.collection('fpTokens').insertOne(postData);
      sendMail(check.email,'Linktree-clone password reset link', "<p>Please Click <a href='http://localhost:3000/pass-reset/"+ id +"'>here<a> to reset your password.</p>");
      res.status(200).json({message:"Success"}); 
      }
      else{
       res.status(400).json({message:"User Not Found"});   
      }
      clientInfo.close();      
   }
   catch(e){
      console.log(e); 
   }
})

app.post('/pass-reset-confirm/:id',async(req,res)=>{
     try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        let findUser = await db.collection('fpTokens').findOne({tokenId:+req.params.id});
        if(findUser.tokenStatus === true){ 
        let salt = await bcrypt.genSalt(10);
        let hash =await bcrypt.hash(req.body.password, salt);
        req.body.password = hash;
        await db.collection('users').findOneAndUpdate({email:findUser.email},{$set:{password:req.body.password}});    
        await db.collection('fpTokens').findOneAndUpdate({tokenId:+req.params.id},{$set:{tokenStatus:false}});
        res.status(200).json({message:"Success"});
        }
        else{
         res.send(400).json({message:"Link is expired,try again.."});   
        }
     }
     catch(e){
       console.log(e);
     }
})

app.put('/activate',async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        await db.collection('users').findOneAndUpdate({email:req.query.email},{$set:{status:true}});
        res.status(200).json({Message:"Success"});
    }
    catch(e){
       console.log(e);
    }
 })

app.delete("/delete-account",authenticate,async(req,res)=>{
     try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app'); 
        await db.collection('users').findOneAndDelete({userName:req.query.userName});
        await db.collection('links').findOneAndDelete({userName:req.query.userName});   
        res.status(200).json({Message:"Success"});
     }
     catch(e){
        console.log(e);
     }
})

//to update user info
app.put('/update-uInfo',authenticate,async(req,res)=>{
     try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        await db.collection('users').findOneAndUpdate({userName:req.query.userName},{$set:{fullName:req.body.fullName, email:req.body.email}});
        res.status(200).json({message:"Success"});
        clientInfo.close();
     }
     catch(e){
          console.log(e);
     }
})

//to store links to db
app.post('/post-links',authenticate,async(req,res)=>{
    try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('app');
      let resp = await db.collection('links').insertOne(req.body);
      res.status(200).json({message:"Success"});
    }
    catch(e){
        console.log(e);
    }
})

app.delete('/delete',authenticate,async(req,res)=>{
     try{
      let clientInfo = await mongoClient.connect(dbUrl);
      let db = clientInfo.db('app');
      await db.collection('users').findOneAndDelete({userName:req.query.userName});
      await db.collection('links').findOneAndDelete({userName:req.query.userName});
      res.status(200).json({message:"Deleted successfully"})
      clientInfo.close();
     }
     catch(e){
        console.log(e);
     }
})

app.put('/update-tree',authenticate,async(req,res)=>{
    try{
        let clientInfo = await mongoClient.connect(dbUrl);
        let db = clientInfo.db('app');
        await db.collection('links').findOneAndUpdate({userName:req.query.userName},{$set:{links:req.body.links}});
        res.status(200).json({message:"Updated successfully"});
    }
    catch(e){
        console.log(e);
    }
})

//to get tree
app.get('/tree',authenticate,async(req,res)=>{
     try{
       let clientInfo = await mongoClient.connect(dbUrl);
       let db = clientInfo.db('app');
       let data = await db.collection('links').findOne({userName:req.query.userName});
       res.status(200).json({message:"success", data});
     }
     catch(e){
        console.log(e);
     }
})

app.get('/',authenticate,(req,res)=>{
    res.status(200).json({message:"Success"});
})

//for token authentication.
function authenticate(req,res,next){
     if(req.headers.authorisation !== undefined){
         jwt.verify(
            req.headers.authorisation,
            process.env.JWT_KEY,
            (err,decode)=>{
               if(decode !== undefined){
                   next();
               }
               else{
                res.send(401).json({message:"No authorisation."})          
               }
            }             
         ) 
     } 
     else{
         res.send(401).json({message:"No authorisation."})
     }
}

function sendMail(_email,_subject,_content){
    let mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
         user:'shubhganeshan@gmail.com',
         pass:'bytxnbanvbapmdln'
        }
    })

    let mailDetails = {
        from: 'shubhganeshan@gmail.com',
        to: _email,
        subject: _subject,
        html:_content
    }

    mailTransporter.sendMail(mailDetails, function(err,data){
          if(err){
              console.log(err);
          }
          else{
              console.log("Email sent successfully to"+ _email);
          }
    })
}

app.listen(port, ()=>{console.log("Server is listening on port"+ port);})