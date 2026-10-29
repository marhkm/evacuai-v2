<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Support\Unseen;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The officer opened a tab: its "new" badge starts counting from now. */
class SeenController extends Controller
{
    public function __invoke(Request $request, string $tab): Response
    {
        Unseen::mark($request->user(), $tab);

        return response()->noContent();
    }
}
