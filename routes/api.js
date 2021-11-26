'use strict';
const bcrypt = require('bcrypt');
const fetch = require("node-fetch");
const mongoose = require('mongoose');
mongoose.connect(process.env.DB, { useNewUrlParser: true, useUnifiedTopology: true });

module.exports = function (app) {

  const stockSchema = new mongoose.Schema({
    stock: {type: String, required: true},
    address: [String]
  });
  const Stocks = mongoose.model('Stocks', stockSchema);

  // This function compare IP with the list of hashed address if the IP liked before
  const didNotLike = (address, listOfAddress) => {
    for (let elem of listOfAddress) {
      let result = bcrypt.compareSync(address, elem);
      if (result) {
        return false;
      }
    }
    return true;
  }

  const url = 'https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/';

  app.route('/api/stock-prices')
    .get(function (req, res){
      // If type of query.stock is string (means just 1 stock)
      if (typeof req.query.stock == 'string') {
        //Search MongoDB to get likes and check & add IP if query.like == 'true'
        Stocks.findOne({stock: req.query.stock.toLowerCase()}, (err, doc) => {
          if (err) return console.log(err);
          let likes = 0;
          // If not found in MongoDB
          if (doc == null) {
            // Add one if query.like == true
            if (req.query.like == 'true') {
              likes = likes + 1;
              let hash = bcrypt.hashSync(req.ip, 12);
              let newStock = new Stocks({stock: req.query.stock.toLowerCase(), address: [hash]});
              newStock.save((err, data) => {
                if (err) return console.log(err);
              });
            }
          }
          // else stock exists, get likes from MongoDB
          else {
            likes = doc.address.length;
            // If query.like == 'true' check the IP if not liked before then add IP
            if (req.query.like == 'true') {
              if (didNotLike(req.ip, doc.address)) {
                likes = likes + 1;
                let hash = bcrypt.hashSync(req.ip, 12);
                doc.address.push(hash);
                doc.save((err, data) => {
                  if (err) return console.log(err);
                });
              }
            }
          }
          // Get price from freeCodeCamp's API using Promise.all() to make sure all promises is solved
          let urlList = [url + req.query.stock.toLowerCase() + '/quote'];
          let promises = urlList.map(url => fetch(url));
          Promise.all(promises).then(async(data) => {
            // Get json, must use await in async function for json() function completed
            data = await data[0].json();
            let stock = data.symbol;
            let price = data.latestPrice;
            res.json({stockData: {stock, price, likes}});
          });
        });
      }
      // else if type of query.stock is not string (object - means 2 stocks passed)
      else {
        let queryStocks = req.query.stock.map(stock => stock.toLowerCase());
        //Search MongoDB to get likes and check & add IP if query.like == true
        Stocks.find({stock: {$in: queryStocks}}, (err, docs) => {
          if (err) return console.log(err);
          let like = [];
          // If both stocks not found
          if (docs.length == 0) {
            like = [0, 0];
            // Add one if query.like == true, like will be [1, 1] but we get the rel_likes so not nessecery to change like
            if (req.query.like == 'true') {
              let hash = bcrypt.hashSync(req.ip, 12);
              for (let stock of queryStocks) {
                let newStock = new Stocks({stock, address: [hash]});
                newStock.save((err, data) => {
                  if (err) return console.log(err);
                });
              }
            }
          }
          // else if just one stock exist
          else if (docs.length == 1) {
            // Get like from MongoDB for the exist stock, add 0 for the not found
            for (let stock of queryStocks) {
              if (stock == docs[0].stock) {
                like.push(docs[0].address.length);
              }
              else {
                like.push(0);
              }
            }
            // If query.like == 'true'
            if (req.query.like == 'true') {
              let hash = bcrypt.hashSync(req.ip, 12);
              for (let i in queryStocks) {
                // If stock exist, check the IP if not liked before then add IP
                if (queryStocks[i] == docs[0].stock) {
                  if (didNotLike(req.ip, docs[0].address)) {
                    like[i] = like[i] + 1;
                    docs[0].address.push(hash);
                    docs[0].save((err, data) => {
                      if (err) return console.log(err);
                    });
                  }
                }
                // else add new one
                else {
                  like[i] = like[i] + 1;
                  let newStock = new Stocks({stock: queryStocks[i], address: [hash]});
                  newStock.save((err, data) => {
                    if (err) return console.log(err);
                  });
                }
              }
            }
          }
          // else both stocks exists, get their like from MongoDB, add 1 if not liked before
          else {
            for (let stock of queryStocks) {
              for (let doc of docs) {
                if (stock == doc.stock && didNotLike(req.ip, doc.address)) {
                  like.push(doc.address.length + 1);
                }
                else if (stock == doc.stock) {
                  like.push(doc.address.length);
                }
              }
            }
            // If query.like == 'true' check the IP if not liked before then add IP
            if (req.query.like == 'true') {
              for (let doc of docs) {
                if (didNotLike(req.ip, doc.address)) {
                  let hash = bcrypt.hashSync(req.ip, 12);
                  doc.address.push(hash);
                  doc.save((err, data) => {
                    if (err) return console.log(err);
                  });
                }
              }
            }
          }
          // Get price from freeCodeCamp's API using Promise.all() to make sure all promises is solved
          let urlList = queryStocks.map(stock => url + stock + '/quote');
          let promises = urlList.map(url => fetch(url));
          Promise.all(promises).then(async(data) => {
            // Get json, must use await in async function for json() function completed
            for (let i = 0; i < data.length; i++) {
              data[i] = await data[i].json();
            }
            let stock0 = {stock: data[0].symbol, price: data[0].latestPrice, rel_likes:   like[0] - like[1]};
            let stock1 = {stock: data[1].symbol, price: data[1].latestPrice, rel_likes:   like[1] - like[0]};
            res.json({stockData: [stock0, stock1]});
          });
        });
      }
    });
    
};

  // bcrypt recommend use hash function asynchronize, but have to use it synchronize for the tests run correctly
  /*
  app.route('/api/stock-prices')
    .get(function (req, res){
      // If type of query.stock is string (means just 1 stock)
      if (typeof req.query.stock == 'string') {
        //Search MongoDB to get likes and check & add IP if query.like == 'true'
        Stocks.findOne({stock: req.query.stock.toLowerCase()}, (err, doc) => {
          if (err) return console.log(err);
          let likes = 0;
          // If not found in MongoDB
          if (doc == null) {
            // Add one if query.like == true, likes will remain 0 as declared above
            if (req.query.like == 'true') {
              bcrypt.hash(req.ip, 12, (err, hash) => {
                if (err) return console.log(err);
                let newStock = new Stocks({stock: req.query.stock.toLowerCase(), address: [hash]});
                newStock.save((err, data) => {
                  if (err) return console.log(err);
                });
              });
            }
          }
          // else stock exists, get likes from MongoDB
          else {
            likes = doc.address.length;
            // If query.like == 'true' check the IP if not liked before then add IP
            if (req.query.like == 'true') {
              if (didNotLike(req.ip, doc.address)) {
                bcrypt.hash(req.ip, 12, (err, hash) => {
                  if (err) return console.log(err);
                  doc.address.push(hash);
                  doc.save((err, data) => {
                    if (err) return console.log(err);
                  });
                });
              }
            }
          }
          // Get price from freeCodeCamp's API using Promise.all() to make sure all promises is solved
          let urlList = [url + req.query.stock.toLowerCase() + '/quote'];
          let promises = urlList.map(url => fetch(url));
          Promise.all(promises).then(async(data) => {
            // Get json, must use await in async function for json() function completed
            data = await data[0].json();
            let stock = data.symbol;
            let price = data.latestPrice;
            res.json({stockData: {stock, price, likes}});
          });
        });
      }
      // else if type of query.stock is not string (object - means 2 stocks passed)
      else {
        let queryStocks = req.query.stock.map(stock => stock.toLowerCase());
        //Search MongoDB to get likes and check & add IP if query.like == true
        Stocks.find({stock: {$in: queryStocks}}, (err, docs) => {
          if (err) return console.log(err);
          let like = [];
          // If both stocks not found
          if (docs.length == 0) {
            // Add one if query.like == true, like will be [0, 0]
            if (req.query.like == 'true') {
              bcrypt.hash(req.ip, 12, (err, hash) => {
                if (err) return console.log(err);
                for (let stock of queryStocks) {
                  let newStock = new Stocks({stock, address: [hash]});
                  newStock.save((err, data) => {
                    if (err) return console.log(err);
                  });
                }
              });
            }
            like = [0, 0];
          }
          // else if just one stock exist
          else if (docs.length == 1) {
            // If query.like == 'true'
            if (req.query.like == 'true') {
              bcrypt.hash(req.ip, 12, (err, hash) => {
                if (err) return console.log(err);
                for (let stock of queryStocks) {
                  // If stock exist, check the IP if not liked before then add IP
                  if (stock == docs[0].stock) {
                    if (didNotLike(req.ip, docs[0].address)) {
                      docs[0].address.push(hash);
                      docs[0].save((err, data) => {
                        if (err) return console.log(err);
                      });
                    }
                  }
                  // else add new one
                  else {
                    let newStock = new Stocks({stock, address: [hash]});
                    newStock.save((err, data) => {
                      if (err) return console.log(err);
                    });
                  }
                }
              });
            }
            // Get like from MongoDB for the exist stock, add 0 for the not found
            for (let stock of queryStocks) {
              if (stock == docs[0].stock) {
                like.push(docs[0].address.length);
              }
              else {
                like.push(0);
              }
            }
          }
          // else both stocks exists, get their like from MongoDB 
          else {
            // If query.like == 'true' check the IP if not liked before then add IP
            if (req.query.like == 'true') {
              for (let doc of docs) {
                if (didNotLike(req.ip, doc.address)) {
                  bcrypt.hash(req.ip, 12, (err, hash) => {
                    if (err) return console.log(err);
                    doc.address.push(hash);
                    doc.save((err, data) => {
                      if (err) return console.log(err);
                    });
                  });
                }
              }
            }
            for (let stock of queryStocks) {
              for (let doc of docs) {
                if (stock == doc.stock) {
                  like.push(doc.address.length);
                }
              }
            }
          }
          // Get price from freeCodeCamp's API using Promise.all() to make sure all promises is solved
          let urlList = queryStocks.map(stock => url + stock + '/quote');
          let promises = urlList.map(url => fetch(url));
          Promise.all(promises).then(async(data) => {
            // Get json, must use await in async function for json() function completed
            for (let i = 0; i < data.length; i++) {
              data[i] = await data[i].json();
            }
            let stock0 = {stock: data[0].symbol, price: data[0].latestPrice, rel_likes:   like[0] - like[1]};
            let stock1 = {stock: data[1].symbol, price: data[1].latestPrice, rel_likes:   like[1] - like[0]};
            res.json({stockData: [stock0, stock1]});
          });
        });
      }
    });
  */
