import os
from pathlib import Path
import datetime as dt
import numpy as np
import pusher
from dotenv import load_dotenv
from flask import Flask, request, jsonify

import time
from datetime import date

import psycopg2
from psycopg2.extras import execute_values

plans_length = 64

# Get the current file's path and directory
current_file = Path(__file__).resolve()
current_directory = current_file.parent

# Load environment variables from 'development.env' file
dotenv_path = current_directory / 'development.env'
load_dotenv(override=True, dotenv_path=dotenv_path)

# pusher_client = pusher.Pusher(
#   app_id=os.getenv("APP_ID"),
#   key=os.getenv("KEY"),
#   secret=os.getenv("SECRET"),
#   cluster=os.getenv("CLUSTER"),
#   ssl=True
# )

# db config

db_params = {
    'host': os.getenv("HOST"),
    'database': os.getenv("DATABASE"),
    'user': os.getenv("USER"),
    'password': os.getenv("PASSWORD"),
}


app = Flask(__name__)

@app.route("/v1/merge", methods=['POST'])
def merge_calendars():
    data = request.get_json()
    calendarEventsList = []
    weightsList = []
    if 'calendarEventsList' in data:
        calendarEventsList = data['calendarEventsList']
    if 'weightsList' in data:
        weightsList = data['weightsList']

    if not (calendarEventsList and weightsList):
        return jsonify({'error': "Incomplete calendars or weights"}), 400

    conn = psycopg2.connect(**db_params)
    cursor = conn.cursor()
    try:

    except psycopg2.Error as e:
        data
    finally:
        cursor.close()
        conn.close()


@app.route("/v1/update", methods=['POST'])
def update_calendars():
    data = [{
        globalEventId: int,
        desiredStart: str (varchar(26)),
        intervalsLength: int
    }, ...]
    data = request.get_json()


class Task:
    # we want
    #   taskID
    #   task fixed or not -> if fixed, set importance to -1
    #   task importance
    pass


class Request:
    GET = requests.get
    POST = requests.post
    UPDATE = requests.update
    DELETE = requests.delete

    def __getattribute__(self, name):
        raise AttributeError("Can't get attribute.")


def convert_json_to_dict(url, request_type, headers={"accept": "application/json"}):
    response = getattr(Request(), 'request_type')(url, headers=headers)
    response_json = response.json()
    return response_json


def add_or_fix_subroutine(val1, val2):
    if val1 < 0 or val2 < 0:
        return -1
    return val1 + val2


def add_or_fix(plan_list: list[np.array], weight_list: list[np.array]):
    result = np.zeros(plans_length, dtype=float)
    for weight, plan in zip(weight_list, plan_list):
        result = add_or_fix_subroutine(result, weight * plan)
    return result


class Plans:

    def __init__(self, groups: list, connections: dict):
        self.planId = list()
        self.planImportance = np.array(dtype=float)
        self.fixedPlans = list()
        self.groups = groups
        self.connections = connections
        self.distinctConnections = len(connections)

    # task ~ {sample dt.time object:[description, isFixed, ...], ...}

    def addTasksToPlans(self, tasks: dict):
        for key, value in tasks.items():
            self.plan[key] = value[0]
            self.fixedPlans[key] = value[1]

    # removes connections and updates connections + distinctConnections
    def modifyConnections(self):
        pass


# the plans will not be the entire day, but rather start from the current time

class Member:
    members = dict()

    def __init__(self, user_id: int, plans: list[Plans]):
        if Member.members.has_key(user_id):
            raise ValueError(f"duplicate user with id {user_id} exists")
        self.user_id = user_id
        self.plans = plans
        Member.members[user_id] = self

    def add_plan(self, plan: Plans):
        self.plans.append(plan)


class Group:
    groups = dict()

    def __init__(self, group_id: int, members: list(Member), weights: list(int), formally_in_clique: bool,
                 clique_id=None):
        if Group.groups.has_key(group_id):
            raise ValueError(f"duplicate user with id {group_id} exists")
        self.members = members
        self.weights = weights
        self.formally_in_clique = formally_in_clique
        self.clique_id = clique_id
        Group.groups[group_id] = self

    def add_member(self, member: Member):
        self.members.append(member)

    # def update_weights(self, ):


# returns True if plans not conflicting, else returns false
def prevent_overlap(fixed_A, fixed_B):
    i = 0
    assert len(fixed_A) == len(fixed_B)
    while i < len(fixed_A):
        if fixed_A[i] and fixed_B[i]:
            return False
    return True


def preprocess(plans: list[Plans]):
    pass


def update_plans(plan_list: list[Plans]):
    culminated_plan = add_or_fix(plan_list, )


if __name__ == "__main__":
    time = dt.time(18, 9, 0)
    print(time < dt.time(18, 10, 0))