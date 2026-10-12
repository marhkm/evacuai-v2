<?php

it('reports health on the API with CORS headers for the web app', function () {
    $this->getJson('/api/health', ['Origin' => 'http://localhost:8081'])
        ->assertOk()
        ->assertExactJson(['status' => 'ok'])
        ->assertHeader('Access-Control-Allow-Origin');
});
