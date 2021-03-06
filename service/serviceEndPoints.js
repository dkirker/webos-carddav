//***************************************************
// Validate contact username/password 
//***************************************************
var checkCredentialsAssistant = function(future) {};


checkCredentialsAssistant.prototype.run = function(future) {  
    var args = this.controller.args;  
    console.log("Test Service: checkCredentials args =" + JSON.stringify(args));
    var parts = args.username.split("|");
    
    if (parts.length !== 2) {
        future.result = {errorCode: "FORMAT_ERROR", returnValue: false};
    }
    
    var username = parts[0];
    var password = args.password;

    //...Base64 encode our entered username and password
    var base64Auth = "Basic " + Base64.encode(username + ":" + password);
			 
    //ServerURL and syncURL _DO_ need to be populated
    //Note the https. Also, I couldn't make a non standard port work. Feel free to try yourself though!
    var syncURL = parts[1];



	 console.log("Test Service: checkCredentials, syncURL =" + syncURL);
	 


     //...If request fails, the user is not valid
     AjaxCall.get(syncURL, {headers: {"Authorization":base64Auth, "Connection": "keep-alive"}}).then ( function(f2)
     {
        if (f2.result.status == 200 ) // 200 = Success
        {	 
        	console.log("Password OK!");
            //...Pass back credentials and config; config is passed to onEnabled
		    future.result = {returnValue: true, "credentials": {"common":{ "password" : password, "username":username}},
                                                "config": { "password" : password, "username": username, "url": syncURL } };
					
        }
        else   
        {
        	console.log("Password bad");
		   		future.result = {errorCode: "403_UNAUTHORIZED", returnValue: false};
        }

     });	
     
};

//***************************************************
// Capabilites changed notification
//***************************************************
var onCapabilitiesChangedAssistant = function(future){};

// 
// Called when an account's capability providers changes. The new state of enabled 
// capability providers is passed in. This is useful for Synergy services that handle all syncing where 
// it is easier to do all re-syncing in one step rather than using multiple 'onEnabled' handlers.
//

onCapabilitiesChangedAssistant.prototype.run = function(future) { 
    var args = this.controller.args; 
    console.log("Test Service: onCapabilitiesChanged args =" + JSON.stringify(args));   
    future.result = {returnValue: true};
};

//***************************************************
// Credentials changed notification 
//***************************************************
var onCredentialsChangedAssistant = function(future){};
//
// Called when the user has entered new, valid credentials to replace existing invalid credentials. 
// This is the time to start syncing if you have been holding off due to bad credentials.
//
onCredentialsChangedAssistant.prototype.run = function(future) { 
    var args = this.controller.args; 
    console.log("Test Service: onCredentialsChanged args =" + JSON.stringify(args));    
    future.result = {returnValue: true};
};


//***************************************************
// Account created notification
//***************************************************
var onCreateAssistant = function(future){};

//
// The account has been created. Time to save the credentials contained in the "config" object
// that was emitted from the "checkCredentials" function.
//
onCreateAssistant.prototype.run = function(future) {  

    var args = this.controller.args;

    //...Username/password passed in "config" object
    var B64username = Base64.encode(args.config.username);
    var B64password = Base64.encode(args.config.password);
    //console.log("Username: " + args.config.username);
    //console.log("Password: " + args.config.password);

    var keystore1 = { "keyname":"AcctUsername", "keydata": B64username, "type": "AES", "nohide":true};
    var keystore2 = { "keyname":"AcctPassword", "keydata": B64password, "type": "AES", "nohide":true};
    var keystore2 = { "keyname":"AcctURL", "keydata": args.config.url, "type": "AES", "nohide":true};

    //...Save encrypted username/password for syncing.
    PalmCall.call("palm://com.palm.keymanager/", "store", keystore1).then( function(f) 
    {
        if (f.result.returnValue === true)
        {
            PalmCall.call("palm://com.palm.keymanager/", "store", keystore2).then( function(f2) 
           {
              future.result = f2.result;
           });
        }
        else   {
           future.result = f.result;
        }
    });
};

//***************************************************
// Account deleted notification
//***************************************************
var onDeleteAssistant = function(future){};

//
// Account deleted - Synergy service should delete account and config information here.
//

onDeleteAssistant.prototype.run = function(future) { 


    //..Create query to delete contacts from our extended kind associated with this account
    var args = this.controller.args;
    var q ={ "query":{ "from":"com.openmobl.contact.carddav:1", "where":[{"prop":"accountId","op":"=","val":args.accountId}] }};

    //...Delete contacts from our extended kind
    PalmCall.call("palm://com.palm.db/", "del", q).then( function(f) 
    {
        if (f.result.returnValue === true)
        {
           //..Delete our housekeeping/sync data
           var q2 = {"query":{"from":"com.openmobl.contact.carddav.transport:1"}};
           PalmCall.call("palm://com.palm.db/", "del", q2).then( function(f1) 
           {
              if (f1.result.returnValue === true)
              {
                 //...Delete our account username/password from key store
                 PalmCall.call("palm://com.palm.keymanager/", "remove", {"keyname" : "AcctUsername"}).then( function(f2) 
                 {
                    if (f2.result.returnValue === true)
                    {
                       PalmCall.call("palm://com.palm.keymanager/", "remove", {"keyname" : "AcctPassword"}).then( function(f3) 
                       {
                          future.result = f3.result;
                       });
                    }
                    else   {
                       future.result = f2.result;
                    }
                 });   
              }
              else   {
                 future.result = f1.result;
              }
           });
        }
        else   {
           future.result = f.result;
        }
    });     
};

//*****************************************************************************
// Capability enabled notification - called when capability enabled or disabled
//*****************************************************************************
var onEnabledAssistant = function(future){};

//
// Synergy service got 'onEnabled' message. When enabled, a sync should be started and future syncs scheduled.
// Otherwise, syncing should be disabled and associated data deleted.
// Account-wide configuration should remain and only be deleted when onDelete is called.
// 

onEnabledAssistant.prototype.run = function(future) {  



    var args = this.controller.args;

    if (args.enabled === true) 
    {
        //...Save initial sync-tracking info. Set "lastSync" to a value that returns all records the first-time
        var acctId = args.accountId;
        var ids = [];
        var syncRec = { "objects":[{ _kind: "com.openmobl.contact.carddav.transport:1", "lastSync":"2005-01-01T00:00:00Z", "accountId":acctId, "remLocIds":ids}]};
        PalmCall.call("palm://com.palm.db/", "put", syncRec).then( function(f) 
        {
            if (f.result.returnValue === true)
            {
               PalmCall.call("palm://com.openmobl.contact.carddav.service/", "sync", {}).then( function(f2) 
               { 
                  // 
                  // Here you could schedule additional syncing via the Activity Manager.
                  //
                  future.result = f2.result;
               });
            }
            else {
               future.result = f.result;
            }
        });
    }
    else {
       // Disable scheduled syncing and delete associated data.
    }

    future.result = {returnValue: true};    
};


//***************************************************
// Sync function
//***************************************************
var syncAssistant = function(future){};

syncAssistant.prototype.run = function(future) { 

        var args = this.controller.args;

	    var username = "";
	    var password = "";
	
	    //..Retrieve our saved username/password
		PalmCall.call("palm://com.palm.keymanager/", "fetchKey", {"keyname" : "AcctUsername"}).then( function(f) 
        {
		   		if (f.result.returnValue === true)
		   	{
		      username = Base64.decode(f.result.keydata);
		      PalmCall.call("palm://com.palm.keymanager/", "fetchKey", {"keyname" : "AcctPassword"}).then( function(f1) 
              {
                  if (f1.result.returnValue === true)
		          {
			         password = Base64.decode(f1.result.keydata);

					 //..Format authentication
					 var base64Auth = "Basic " + Base64.encode(username + ":" + password);
           var serverURL = "https://" + "CARDDAV SERVER URL"
    		   var syncURL = serverURL + "If there's a path in the tree (e.g. /webdav/you/contacts) that goes here...";
    		   //Yes, that was the same as above, and yes, if this was well written code, you wouldn't have to put it in down here as well...
    		   
    		   

                     //..Get our sync-tracking information saved previously in a db8 object
                     var q = {"query":{"from":"com.openmobl.contact.carddav.transport:1"}};
			         PalmCall.call("palm://com.palm.db/", "find", q).then( function(f2) 
                     {
                        if (f2.result.returnValue === true)
                        {
                           var id        = f2.result.results[0]._id; 
                           var accountId = f2.result.results[0].accountId;     
                           var remLocIds = f2.result.results[0].remLocIds;  // local id/remote id pairs
                           var lastSync  = f2.result.results[0].lastSync;   // date/time since last sync


                           var depth = 1; 
                           
                           /**************************************************************
                           
                           This is important, it governs how far down the tree it will look.
                           e.g for depth = 1 it will only find contacts in the root folder of your contact tree
                           for depth = 2 it will also get contacts from the first level of subfolders
                           etc. etc. There's presumably a limit somewhere, but I don't know what it is
                           
                           
                           (depth = 1)
                           |-ContactA
                           |-ContactB
                           
                           (depth = 2)
                           |-ContactA
                           |-ContactB
                           +-Work contacts folder
                           | |-ContactC
                           | |-ContactD


													***************************************************************/
														
														
                           AjaxCall.get(syncURL, {customRequest   : "PROPFIND", headers: {"Authorization":base64Auth, "Content-type":"text/xml", "Depth": depth, "Connection": "keep-alive"}}).then ( function(f3)
                           {
                           	console.log("Result status: "+f3.result.status);

                           	var xmlstring = f3.result.responseText;
                           	
                           	var pos = 0;
                           	var endSPos = xmlstring.lastIndexOf("<response>");
                           	var endEPos = xmlstring.lastIndexOf("</response>");

                           	var i = 0;
                           	var Spos = new Array();
                           	var Epos = new Array();
                           	while(pos < endSPos)
                           	{
                           		Spos[i] = xmlstring.indexOf("<response>", pos);
                           		pos = Spos[i];
                           		Epos[i] = xmlstring.indexOf("</response>", pos) + 11; 

                           		pos = Epos[i];
                           		i++;

                           	}
                           	console.log("Number of records: " + i);

                           	
                           	var content = new Array();
                           	var j = 0;
                           	while(j < i)
                           	{
                           		content[j] = xmlstring.substring(Spos[j],Epos[j]);

                           		
                           		var urlStart = content[j].indexOf("<href>") + 6;
                           		var urlEnd = content[j].indexOf("</href>");
                           		
                           		var urlString = content[j].substring(urlStart,urlEnd);

                           		
                           		if(urlString.substring(urlString.length - 4) == ".vcf")
                           		{
                           			//console.log("Found Vcard: " + urlString);
                           			var vcardURL = serverURL+urlString;
                           			//console.log("URI: " + vcardURL);

                           			AjaxCall.get(vcardURL, { headers: {"Authorization":base64Auth, "Content-type":"text/xml", "Connection": "keep-alive"}}).then ( function(ff)
                           			{
                           				var vcard = ff.result.responseText;
                           				//console.log(vcard);
                           				
                           				// All this assumes that your Vcards have "^M" at the end of every line.
                           				// Whilst I think this is required, I'm not 100% sure
                           				// If I'm wrong, then this code will fail quite spectacularly!
                           				
                           				

                           				var FNstart = vcard.indexOf("FN:") + 3;
                           				var FNstop = vcard.indexOf("\n", FNstart) - 1;
                           				var FNstring = vcard.substring(FNstart,FNstop);
                           				
                           				
                           				var Nstart = vcard.indexOf("\nN:") + 3;
                           				var Nstop = vcard.indexOf("\n", Nstart) - 1;
                           				var Nstring = vcard.substring(Nstart,Nstop);
                           				var namearray = Nstring.split(";");

                           				var familyname = namearray[0];
                           				var firstname = namearray[1];
                           				var middlename = namearray[2];
                           				var honorificprefix = namearray[3];
                           				var honorificsuffix = namearray[4];

																	//Probably have problems with more than one e-mail address of phone number...                           				
                           				var eAddrstart = vcard.indexOf("\nEMAIL;TYPE=");
                           				if(eAddrstart != -1)
                           				{
	                           				eAddrstart =eAddrstart + 13;
	                           				var eAddrstop = vcard.indexOf("\n",eAddrstart) - 1;
	                           				var eAddrstring = vcard.substring(eAddrstart,eAddrstop).split(":");
	                           				var priEAddr = eAddrstring[1];
	                           			}
	                           			
	                           			
                           				var Bdaystart = vcard.indexOf("\nBDAY:");
                           				var BdayOutString;
                           				if (Bdaystart != -1)
                           				{
                           					Bdaystart = Bdaystart + 6;
	                           				var Bdaystop = vcard.indexOf("\n",Bdaystart) - 1;
	                           				var Bdaystring = vcard.substring(Bdaystart,Bdaystop);
	                           				var BdayYear = Bdaystring.substr(0,4);
	                           				var BdayMonth = Bdaystring.substr(4,2);
	                           				var BdayDay = Bdaystring.substr(6,2);
	                           				var BdayOutString = BdayYear + "-" + BdayMonth + "-" + BdayDay;
	                           			}	
	                           			
	                           			var Telstart = vcard.indexOf("\nTEL;");
                           				if(Telstart != -1)
                           				{
	                           				Telstart = Telstart + 5;
	                           				var Telstop = vcard.indexOf("\n",Telstart) - 1;
	                           				var Telstring = vcard.substring(Telstart,Telstop).split(":");
	                           				var Telno = Telstring[1];
	                           			}
	               
                           				

                           				var createdstart = vcard.indexOf("\nCREATED:") + 9;
                           				var createdstop = vcard.indexOf("\n", createdstart) - 1;
                           				var createdstring = vcard.substring(createdstart,createdstop);

                           				var createdYYYY = createdstring.substr(0,4);
                           				var createdMM = createdstring.substr(4,2);
                           				var createdDD = createdstring.substr(6,2);
                           				var createdHH = createdstring.substr(9,2);
                           				var createdMM = createdstring.substr(11,2);
                           				var createdSS = createdstring.substr(13,2);
                           				var createdTZ = createdstring.substr(15,1);
                           				var createdOutString = createdYYYY + "-" + createdMM + "-" + createdDD + "T"
                           				+ createdHH + ":" + createdMM +":" + createdSS + createdTZ;
                           				

                           				
                           				var revstart = vcard.indexOf("\nREV:") + 5;
                           				var revstop = vcard.indexOf("\n", revstart) - 1;
                           				var revstring = vcard.substring(revstart,revstop);

                           				var revYYYY = revstring.substr(0,4);
                           				var revMM = revstring.substr(4,2);
                           				var revDD = revstring.substr(6,2);
                           				var revHH = revstring.substr(9,2);
                           				var revMM = revstring.substr(11,2);
                           				var revSS = revstring.substr(13,2);
                           				var revTZ = revstring.substr(15,1);
                           				var revOutString = revYYYY + "-" + revMM + "-" + revDD + "T"
                           				+ revHH + ":" + revMM +":" + revSS + revTZ;
                           				
                           				
                           				
                           				var UIDstart = vcard.indexOf("\nUID:") + 5;
                           				var UIDstop = vcard.indexOf("\n", UIDstart) - 1;
                           				var UIDstring = vcard.substring(UIDstart,UIDstop);
                           				console.log("UID: " + UIDstring);
                           				
                           				
                           				


																	var contact = [{
	
 																	//"id": UIDstring,
																 	published:createdOutString,
 																	updated:revOutString,                       	

																  name: 
																  {
																        "familyName": familyname,
																        "givenName": firstname,
																        "middleName": middlename,
																        "honorificPrefix": honorificprefix,
																        "honorificSuffix": honorificsuffix
																  },

																  birthday: BdayOutString,
																  phoneNumbers: [
																  {
																        value: Telno,
																  }
																  ],
																
																  emails: 
																  {
																        value: priEAddr,
																        type: "type_work",
																        primary : true
																  },
																  /*
																  addresses: {
																        streetAddress: '123 Main St.',
																        locality: 'Centerville',
																        region: "CA",
																        postalCode: '98765',
																        country: "USA"
																  },
																  */
																  /*
																  organizations : {
																        name        : "John Doe &amp; Sons",
																        title       : "CEO",
																        primary     : true
																  },
																  */
																
																  accountId:accountId, 
 																  _kind:"com.openmobl.contact.carddav:1" 
																	}]

																	var newContactObjects = {"objects":contact};
											
																	PalmCall.call("palm://com.palm.db/",  "put", newContactObjects);
                           			  })
                           		}
                           		else
                           		{
                           			if(urlString != syncURL)
                           			{
                           				console.error("Found subdir: " + urlString);
                           			}
                           			else
                           			{
                           			}
                           		}
                           		j++;
                           	}


                         }); 
                     }
                     /* else   {
                        future.result = f2.result;  // Failure to "get" local sync-tracking info
                     }  */         
                 });         
               }
			   /* else {
		             future.result = f1.result;  // Failure to get account pwd from Key Manager
			   } */
           });
		}
		/* else   {
		      future.result = f.result;  // Failure to get account username from Key Manager
		} */
     });  
}; 