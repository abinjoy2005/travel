"""Implementation based on the Crew AI workflow"""

import typing
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

from crewai import LLM, Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

# Import tools from crewai_tools
from crewai_tools import ScrapeWebsiteTool, SerperDevTool

# --- Pydantic Models for Structured Output ---

class Activity(BaseModel):
    name: str = Field(..., description="Name of the activity or restaurant")
    location: str = Field(..., description="Full address of the location")
    description: str = Field(..., description="Brief description of the activity/restaurant")
    why_suitable: str = Field(..., description="Why it's suitable for the traveler")
    rating: Optional[float] = Field(None, description="Rating of the activity/restaurant")
    cost: Optional[float] = Field(0.0, description="Estimated cost or entry fee")
    time: Optional[str] = Field("09:00", description="Suggested time for the activity (HH:MM)")

class Day(BaseModel):
    day_number: int
    activities: List[Activity]

class Itinerary(BaseModel):
    destination: str
    total_cost: float
    days: List[Day]

class AddressCoords(BaseModel):
    name: List[str]
    lat: List[float]
    lon: List[float]

# --- Crew Implementation ---

@CrewBase
class TravelCrew:
    """Crew to do travel planning"""

    def __init__(self, model_name='Meta-Llama-3.3-70B-Instruct') -> None:
        """Initialize the crew."""
        super().__init__()
        # Fix: Configuration files are in the same directory as crew.py
        import os
        base_path = os.path.dirname(__file__)
        self.agents_config = os.path.join(base_path, 'agents.yaml')
        self.tasks_config = os.path.join(base_path, 'tasks.yaml')
        self.llm = LLM(model='sambanova/%s' % model_name)
        self.manager_llm = LLM(model='sambanova/%s' % model_name)
        self.planner_llm = LLM(model='sambanova/%s' % model_name)

    @typing.no_type_check
    @agent
    def personalized_activity_planner(self) -> Agent:
        return Agent(
            config=self.agents_config['personalized_activity_planner'],
            llm=self.llm,
            max_iter=2,
            tools=[SerperDevTool(), ScrapeWebsiteTool()],
            allow_delegation=False,
        )

    @typing.no_type_check
    @agent
    def restaurant_scout(self) -> Agent:
        return Agent(
            config=self.agents_config['restaurant_scout'],
            llm=self.llm,
            max_iter=2,
            tools=[SerperDevTool(), ScrapeWebsiteTool()],
            allow_delegation=False,
        )

    @typing.no_type_check
    @agent
    def interest_scout(self) -> Agent:
        return Agent(
            config=self.agents_config['interest_scout'],
            llm=self.llm,
            max_iter=2,
            tools=[SerperDevTool(), ScrapeWebsiteTool()],
            allow_delegation=False,
        )

    @typing.no_type_check
    @agent
    def itinerary_compiler(self) -> Agent:
        return Agent(
            config=self.agents_config['itinerary_compiler'],
            llm=self.llm,
            max_iter=2,
            allow_delegation=False,
        )

    @typing.no_type_check
    @task
    def interest_scout_task(self) -> Task:
        return Task(config=self.tasks_config['interest_scout_task'],
                    llm=self.llm,
                    max_iter=2,
                    agent=self.interest_scout())

    @typing.no_type_check
    @task
    def personalized_activity_planning_task(self) -> Task:
        return Task(
            config=self.tasks_config['personalized_activity_planning_task'],
            llm=self.llm,
            max_iter=2,
            agent=self.personalized_activity_planner(),
        )

    @typing.no_type_check
    @task
    def restaurant_scenic_location_scout_task(self) -> Task:
        return Task(
            config=self.tasks_config['restaurant_scenic_location_scout_task'],
            llm=self.llm,
            max_iter=2,
            agent=self.restaurant_scout(),
        )

    @typing.no_type_check
    @task
    def itinerary_compilation_task(self) -> Task:
        return Task(
            config=self.tasks_config['itinerary_compilation_task'],
            llm=self.llm,
            max_iter=2,
            agent=self.itinerary_compiler(),
            output_json=Itinerary
        )

    @typing.no_type_check
    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.hierarchical,
            manager_llm=self.manager_llm,
            planning=False,
            planning_llm=self.planner_llm
        )


@CrewBase
class AddressSummaryCrew:
    """Address Summary crew"""
    
    def __init__(self, model_name='Meta-Llama-3.1-70B-Instruct') -> None:
        """Initialize the crew."""
        super().__init__()
        # Fix: Configuration files are in the same directory as crew.py
        import os
        base_path = os.path.dirname(__file__)
        self.agents_config = os.path.join(base_path, 'address_agents.yaml')
        self.tasks_config = os.path.join(base_path, 'address_tasks.yaml')
        self.llm = LLM(model='sambanova/%s' % model_name)

    @typing.no_type_check
    @agent
    def address_summarizer(self) -> Agent:
        return Agent(
            config=self.agents_config['address_summarizer'],
            llm=self.llm,
            max_iter=2,
            allow_delegation=False,
        )

    @typing.no_type_check
    @task
    def address_compilation_task(self) -> Task:
        return Task(
            config=self.tasks_config['address_compilation_task'],
            llm=self.llm,
            max_iter=2,
            agent=self.address_summarizer(),
            output_json=AddressCoords
        )

    @typing.no_type_check
    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
        )
