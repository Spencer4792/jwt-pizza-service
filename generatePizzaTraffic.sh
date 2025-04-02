#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1

cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5 $pid6 $pid7
  exit 0
}
trap cleanup SIGINT

execute_curl() {
  echo $(eval "curl -s -o /dev/null -w \"%{http_code}\" $1")
}

# Execute curl and capture full response for logging validation
execute_curl_with_response() {
  eval "curl -s $1"
}

login() {
  response=$(curl -s -X PUT $host/api/auth -d "{\"email\":\"$1\", \"password\":\"$2\"}" -H 'Content-Type: application/json')
  if echo "$response" | jq -e . >/dev/null 2>&1; then
    token=$(echo "$response" | jq -r '.token')
    echo $token
  else
    echo ""
  fi
}

# Original traffic generators
while true; do
  result=$(execute_curl "$host/api/order/menu")
  echo "Requesting menu..." $result
  sleep 3
done & pid1=$!

while true; do
  result=$(execute_curl "-X PUT \"$host/api/auth\" -d '{\"email\":\"unknown@jwt.com\", \"password\":\"bad\"}' -H 'Content-Type: application/json'")
  echo "Logging in with invalid credentials..." $result
  sleep 25
done & pid2=$!

while true; do
  token=$(login "f@jwt.com" "franchisee")
  echo "Login franchisee..." $( [ -z "$token" ] && echo "false" || echo "true" )
  sleep 110
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out franchisee..." $result
  sleep 10
done & pid3=$!

while true; do
  token=$(login "d@jwt.com" "diner")
  echo "Login diner..." $( [ -z "$token" ] && echo "false" || echo "true" )
  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 1, \"storeId\":1, \"items\":[{ \"menuId\": 1, \"description\": \"Veggie\", \"price\": 0.05 }]}'  -H \"Authorization: Bearer $token\"")
  echo "Bought a pizza..." $result
  sleep 20
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out diner..." $result
  sleep 30
done & pid4=$!

while true; do
  token=$(login "d@jwt.com" "diner")
  echo "Login hungry diner..." $( [ -z "$token" ] && echo "false" || echo "true" )
  
  items='{ "menuId": 1, "description": "Veggie", "price": 0.05 }'
  for (( i=0; i < 21; i++ ))
  do items+=', { "menuId": 1, "description": "Veggie", "price": 0.05 }'
  done
  
  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d \"{\\\"franchiseId\\\": 1, \\\"storeId\\\":1, \\\"items\\\":[$items]}\"  -H \"Authorization: Bearer $token\"")
  echo "Bought too many pizzas..." $result
  
  sleep 5
  result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  echo "Logging out hungry diner..." $result
  sleep 295
done & pid5=$!

# New traffic generators for testing logging functionality

# Test database logging by getting franchises and their stores (generates database queries)
while true; do
  token=$(login "a@jwt.com" "admin")
  echo "Login admin for DB queries..." $( [ -z "$token" ] && echo "false" || echo "true" )
  
  if [ ! -z "$token" ]; then
    # Get all franchises (generates database queries)
    result=$(execute_curl "-X GET $host/api/franchise -H \"Authorization: Bearer $token\"")
    echo "Fetching franchises (DB query)..." $result
    sleep 2
    
    # Get menu (generates database queries)
    result=$(execute_curl "-X GET $host/api/order/menu -H \"Authorization: Bearer $token\"")
    echo "Fetching menu (DB query)..." $result
    sleep 2
    
    # Try to create a store (generates database queries with POST data)
    result=$(execute_curl "-X POST $host/api/franchise/1/store -H 'Content-Type: application/json' -d '{\"name\":\"Test Store\"}' -H \"Authorization: Bearer $token\"")
    echo "Creating store (DB insert)..." $result
    sleep 3
    
    # Log out admin
    result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
    echo "Logging out admin..." $result
  fi
  
  sleep 30
done & pid6=$!

# Test error handling to generate error logs
while true; do
  # Generate 404 errors (not found)
  result=$(execute_curl "-X GET $host/api/nonexistent/endpoint")
  echo "Generating 404 error..." $result
  sleep 5
  
  # Generate 401 errors (unauthorized)
  result=$(execute_curl "-X GET $host/api/franchise")
  echo "Generating 401 error (unauthorized)..." $result
  sleep 5
  
  # Generate 400 errors (bad request)
  result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"badField\": true}'")
  echo "Generating 400 error (bad request)..." $result
  sleep 5
  
  # Try to cause a server error (500)
  token=$(login "d@jwt.com" "diner")
  if [ ! -z "$token" ]; then
    result=$(execute_curl "-X POST $host/api/order -H 'Content-Type: application/json' -d '{\"franchiseId\": 999, \"storeId\":999, \"items\":[{ \"menuId\": 999, \"description\": \"Invalid\", \"price\": 0 }]}' -H \"Authorization: Bearer $token\"")
    echo "Generating potential 500 error..." $result
    
    # Log out
    result=$(execute_curl "-X DELETE $host/api/auth -H \"Authorization: Bearer $token\"")
  fi
  
  sleep 30
done & pid7=$!

wait $pid1 $pid2 $pid3 $pid4 $pid5 $pid6 $pid7