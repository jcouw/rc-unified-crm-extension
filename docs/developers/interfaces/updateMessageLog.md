# updateMessageLog

The `updateMessageLog` interface is an essential part of maintaining a single, unified log for a conversation within a rolling 24-hour window.

## Input parameters

| Parameter          | Description                                                                                              |
|--------------------|----------------------------------------------------------------------------------------------------------|
| `user`             | An object describing the Chrome extension user associated with the action that triggered this interface. |
| `authHeader`           | The HTTP Authorization header to be transmitted with the API request to the target CRM.                  | 
| `contactInfo`          | An associative array describing the contact a call is associated with.                                   |
| `existingMessageLog`          | existing message log entity                                 |
| `message`           | message text                | 

## Reference

=== "Example CRM"

    ```js
    {!> packages/template/src/connectors/interfaces/updateMessageLog.js !}
	```
	
=== "Pipedrive"

	```js
    {!> src/connectors/pipedrive/index.js [ln:611-660] !}
	```

