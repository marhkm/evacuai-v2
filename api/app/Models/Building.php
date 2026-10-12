<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Campus geometry is imported by CampusSeeder; read-only here. */
class Building extends Model
{
    protected $keyType = 'string';

    public $incrementing = false;
}
