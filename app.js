var express = require('express');
var bodyParser = require('body-parser');
var OAuth = require('oauth');
var Particle = require('particle-api-js');
var PushBullet = require('pushbullet');
var nconf = require('nconf');
var nunjucks = require('nunjucks');
var http = require('http');
var complimenter = require( 'complimenter' );
var particle = new Particle({
  baseUrl: 'https://api.particle.io',
  clientSecret: 'particle-api',
  clientId: 'particle-api',
  tokenDuration: 7776000, // 90 days
});

var app = express();

nconf.argv()
    .env()
    .file({ file: __dirname + '/config.json' });

var nunjucksEnv = nunjucks.configure('views', {
    autoescape: false,
    express: app
});

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.set('views', __dirname + '/views');
app.set('view engine', 'html');
app.use(express.static(__dirname + '/static'));

var users = nconf.get('users');
var allowedUsers = nconf.get('allowedUsers');
var baseUrl = nconf.get('baseUrl');
var coffeeMinutes = nconf.get('coffeeMinutes');
var giphyKey = nconf.get('giphyKey');
var antiSpam = false;

var giphyTags = ['funny', 'lol', 'fail', 'failing', 'swag', 'laser', 'cat', 'dog', 'bunny', 'kitten', 'puppy', 'cute', 'godzilla', 'john travolta', 'dickbutt'];

var OAuth2 = OAuth.OAuth2;
var clientId = nconf.get('pushbulletClientId');
var clientSecret = nconf.get('pushbulletClientSecret');
var oauth2 = new OAuth2(
    clientId,
    clientSecret,
    '',
    'https://www.pushbullet.com/authorize',
    'https://api.pushbullet.com/oauth2/token',
    null
);

var shutUpForAWhile = function() {
    antiSpam = true;
    setTimeout(function() {
        antiSpam = false;
    }, 1000);
};

var getUserByToken = function(token, cb) {
  var pusher = new PushBullet(token);
  pusher.me(function(err, user) {
    if (err) {
      cb(false);
    } else {
      user.token = token;
      if (users.indexOf(user) > -1) {
        // We found the user
        cb(user);
      } else {
        cb(false);
      }
    }
  });
};

var getUserByIden = function(iden, cb) {
  var foundUsers = users.filter(function(user) {
    return (user.iden == iden);
  });
  if (foundUsers.length === 1) {
    cb(foundUsers[0]);
  } else {
    cb(false);
  }
};

var notifyTheFleeple = function(message) {
    if (!antiSpam) {
        for (var i = users.length - 1; i >= 0; i--) {
            var user = users[i];
            var pusher = new PushBullet(user.token);
            pusher.note({}, 'For the Fleeple', message);
        }
        shutUpForAWhile();
    }
};

var pollTheFleeple = function(message) {
    if (!antiSpam) {
        for (var i = users.length - 1; i >= 0; i--) {
            var user = users[i];
            var pusher = new PushBullet(user.token);
            pusher.link({}, '' + message, baseUrl + '/poll?iden=' + user.iden);
        }
        shutUpForAWhile();
    }
};

var questionTheFleeple = function(message) {
    if (!antiSpam) {
        for (var i = users.length - 1; i >= 0; i--) {
            var user = users[i];
            var pusher = new PushBullet(user.token);
            pusher.link({}, '' + message, baseUrl + '/question?iden=' + user.iden);
        }
        shutUpForAWhile();
    }
};

var annoyTheFleeple = function(data) {
    if (!antiSpam) {
        if (data.gif) {
            for (var i = users.length - 1; i >= 0; i--) {
                var user = users[i];
                var pusher = new PushBullet(user.token);
                pusher.link({}, 'Annoy the Fleeple', data.gif);
            }
            console.log('Sending dank memes');
        }
        shutUpForAWhile();
    }
};

var complimentFleetee = function(req, res) {
    var event = req.body.event;
    var rando = Math.floor(Math.random() * users.length);
    var fleetee = users[rando];
    var pusher = new PushBullet(fleetee.token);
    var compliment = complimenter();
    if (!antiSpam) {
        pusher.note({}, compliment);
        shutUpForAWhile();
    }
    res.send(true);
};

var coffeeTimer = false;
var startCoffeeTimer = function() {
    if (!coffeeTimer) {
      notifyTheFleeple('The coffee is on!');
      coffeeTimer = setTimeout( function() {
        notifyTheFleeple('The coffee is ready!');
        clearTimeout(coffeeTimer);
        coffeeTimer = false;
      }, 1000 * 60 * coffeeMinutes);
    }
};

var dankMeme = function(req, res) {
  var event = req.body.event;
  var tag = Math.floor(Math.random() * giphyTags.length);
  var url = 'http://api.giphy.com/v1/gifs/random?api_key=' + giphyKey + '&tag=' + encodeURIComponent(giphyTags[tag]);
  http.get(url, function(result){
    var body = '';

    result.on('data', function(chunk){
      body += chunk;
    });

    result.on('end', function(){
      var gif = JSON.parse(body);
      if ( gif.data.image_url ) {
        annoyTheFleeple({gif: gif.data.image_url});
      }
    });
  }).on('error', function(e){
    console.log('Got an error: ', e);
  });
  res.send(true);
};

var particleEvents = function(data) {
    console.log('logged in and running');
    var access_token = data.body.access_token;
    var webhooks = ['fleet-bacon', 'fleet-coffee-on', 'fleet-beer', 'fleet-vegan', 'fleet-random', 'fleet-compliment'];
    // Create all the webhooks we need.
    for (var i = webhooks.length - 1; i >= 0; i--) {
      var webhook = webhooks[i];
      particle.createWebhook({
        name: webhook,
        url: baseUrl + '/webhooks/' + webhook,
        auth: access_token
      });
    }
};

app.get('/', function (req, res) {
  var authURL = oauth2.getAuthorizeUrl({
      redirect_uri: baseUrl + '/code',
      state: 'this is just some gobbledygook for security',
      response_type: 'code'
  });
  var body = '<a class="button" href="' + authURL + '">Login with PushBullet</a>';
  res.render('message.html', {message: body});
});

app.get('/code', function (req, res) {
    if (req.query.code) {
        oauth2.getOAuthAccessToken(
            req.query.code,
            {
                'grant_type': 'authorization_code'
            },
            function (e, access_token, refresh_token, results){
                if (e) {
                    console.log(e);
                    res.render('message.html', {message: 'It\'s all gone tits up.'})
                } else if (results.error) {
                    console.log(results);
                    res.render('message.html', {message: 'It\'s all gone tits up.'})
                }
                else {
                    console.log('Obtained access_token: ', access_token);
                    if (!users) {
                      users = [];
                    }
                    var pusher = new PushBullet(access_token);
                    pusher.me(function(err, user) {
                      if (err) {
                        res.render('message.html', {message: 'Couldn\'t get your profile :('})
                      } else {
                        getUserByIden(user.iden, function(foundUser) {
                          if (allowedUsers.indexOf(user.email) === -1) {
                            res.render('message.html', {message: 'You\'re not on the list of allowed users. Ask an existing user to add you.'})
                          }
                          else {
                            if (!foundUser) {
                              user.token = access_token;
                              users.push(user);
                              nconf.set('users', users);
                              nconf.save();
                            } else {
                              user = foundUser;
                              users[users.indexOf(user)].token = access_token;
                              nconf.save();
                            }
                            res.render('home.html', {user: user});
                          }
                        });
                      }
                    });
                }
        });
    } else {
        res.render('message.html', {message: 'Uh oh. A code is missing'});
    }
});

app.get('/poll', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user) {
        notifyTheFleeple(user.name + ' is in!');
        res.render('message.html', {message: 'You\'re in!'});
      } else {
        res.render('message.html', {message: 'Uh oh!'});
      }
    });
  }
});

app.get('/question', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user) {
        res.render('question.html', {user: user});
      } else {
        res.render('message.html', {message: 'Uh oh!'});
      }
    });
  }
});

app.get('/reply', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user) {
        var message = user.name;
        if (req.query.message) {
          message += ': ' + req.query.message;
        } else {
          message += ' is in!';
        }
        notifyTheFleeple(message);
        res.render('message.html', {message: 'You\'re in!'});
      } else {
        res.render('message.html', {message: 'Uh oh!'});
      }
    });
  }
});

app.get('/bacon', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user) {
        questionTheFleeple(user.name + ' is getting bacon. Click the link if you want some.');
        res.render('message.html', {message: 'The Fleeple have been questioned'});
      } else {
        res.render('message.html', {message: 'Uh oh!'});
      }
    });
  }
});

app.get('/unsubscribe', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user) {
        // We have found this user in the keys
        var i = users.indexOf(user);
        users.splice(i, 1);
        nconf.set('users', users);
        nconf.save();
      }
    });
  }
  res.render('message.html', {message: 'You will no longer be notified'});
});

app.get('/adduser', function (req, res) {
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      res.render('adduser.html', {user: user});
    });
  } else {
    res.render('message.html', {message: 'Uh Oh!'});
  }
});

app.get('/createuser', function (req, res) {
  console.log(req.query);
  if (req.query.iden) {
    getUserByIden(req.query.iden, function(user){
      if (user && req.query.email) {
        allowedUsers.push(req.query.email);
        nconf.set('allowedUsers', allowedUsers);
        nconf.save();
        res.render('message.html', {message: 'That user should be able to register now'});
      }
    });
  } else {
    res.render('message.html', {message: 'Uh Oh!'});
  }
});

// TODO: Verify that request are legit requests from particle.
app.post('/webhooks/fleet-bacon', function(req, res) {
  console.log("Bacon Event: " + req.body.event);

  questionTheFleeple('Someone is going for bacon! Click the link if you want some.');
  res.send(true);
});

app.post('/webhooks/fleet-coffee-on', startCoffeeTimer);

app.post('/webhooks/fleet-beer', function(req, res) {
  console.log("It's beer o clock: " + req.body.event);
  pollTheFleeple('What time is it? It\'s beer\'o\'clock! Click if you\'re coming along');
  res.send(true);
});

app.post('/webhooks/fleet-vegan', function(req, res) {
  questionTheFleeple('A silly vegan clicked a button! Click the link if you want some.');
  res.send(true);
});

app.post('/webhooks/fleet-random', dankMeme);

app.post('/webhooks/fleet-compliment', complimentFleetee);


particle.login({
  username: nconf.get('particleUsername'),
  password: nconf.get('particlePassword'),
  tokenDuration: 60 * 60 * 24 * 365
}).then(particleEvents, function(err) {
  console.log('Error logging into particle:');
  console.log(err.errorDescription);
});

app.listen(nconf.get('port'));
